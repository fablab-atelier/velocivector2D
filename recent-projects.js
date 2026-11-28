'use strict';
const RecentProjects=(()=>{
  const limit=15;
  const callbacks=new Set();
  let entries=[], pending=Promise.resolve();
  function storage() {
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open('velocivector-recent-projects',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('files');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(Error('Recent projects database is blocked.'));
    });
  }
  const database=Promise.resolve().then(storage).catch(()=>null);
  async function restore() {
    const db=await database;
    if(!db) return;
    entries=await new Promise((resolve,reject)=>{
      const request=db.transaction('files').objectStore('files').get('recent');
      request.onsuccess=()=>resolve(Array.isArray(request.result)?request.result.slice(0,limit):[]);
      request.onerror=()=>reject(request.error);
    });
  }
  const ready=restore().catch(()=>{});
  const subscribe=callback=>{
    callbacks.add(callback);
    void ready.then(()=>callback(entries.slice()));
    return ()=>callbacks.delete(callback);
  };
  async function persist() {
    for(const callback of callbacks) callback(entries.slice());
    const db=await database;
    if(db) await new Promise((resolve,reject)=>{
      const transaction=db.transaction('files','readwrite');
      transaction.oncomplete=resolve;
      transaction.onabort=()=>reject(transaction.error);
      transaction.objectStore('files').put(entries,'recent');
    });
  }
  function remember(handle) {
    if(!handle?.getFile) return Promise.resolve();
    pending=pending.then(async()=>{
      await ready;
      const matches=await Promise.all(entries.map(async entry=>{
        if(handle===entry) return true;
        try {return await handle.isSameEntry(entry);}
        catch {return false;}
      }));
      entries=[handle,...entries.filter((_,i)=>!matches[i])].slice(0,limit);
      await persist();
    }).catch(()=>{});
    return pending;
  }
  async function prepareForget(folder) {
    await ready;
    await pending;
    const removed=new Set((await Promise.all(entries.map(async entry=>{
      try {return await folder.resolve(entry)?entry:null;}
      catch {return null;}
    }))).filter(Boolean));
    return ()=>{
      if(!removed.size) return pending;
      pending=pending.then(async()=>{
        entries=entries.filter(entry=>!removed.has(entry));
        await persist();
      }).catch(()=>{});
      return pending;
    };
  }
  return {subscribe,remember,prepareForget};
})();
