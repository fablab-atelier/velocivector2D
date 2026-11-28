'use strict';
VelocivectorPlugins.registerAsync('workshop-builder',async load=>{
  await Promise.all([load('workshop-builder/model.js'),load('workshop-builder/messages.js'),load('workshop-builder/runtime.js')]);
  return VcvWorkshopRuntime.builderPlugin();
});
