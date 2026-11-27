# Velocivector Plugins API v1

- Entry point: `plugins/<id>/plugin.js`, called once at startup by `Lancer.cmd`. ID regex: `^[a-z][a-z0-9-]{0,47}$`.
- Register synchronously with `VelocivectorPlugins.register({id,apiVersion:1,messages,commands,workshops,importers,exporters,postprocessors})`.
- Entries have unique `id` and a `title` translation key.
  - Command: `run(api)`.
  - Workshop: `mount(element,api) => cleanupFunction | undefined`.
  - Importer: `accept`, `read(File,api) => batch | null`. `batch.units` defaults to `document`.
  - Exporter / postprocessor: `extension` including dot, `mime`, `write(drawing,{includeConstruction},api) => string | Blob | ArrayBuffer | typed array`.
- Read: `api.drawing()`, `api.selection()`, `api.activeLayer()`, `api.units()`.
- Write: `api.insert({entities,constraints?},{layer?,units?:'document'|'mm',offset?:[x,y]}) => ids[]`. Undo is atomic. Entity coordinate system is Y-up. Primitive angular parameters use radians.
- Entity batch keys are optional strings. The fallback key is the decimal array index. A reference is `{key,kind:'point'|'edge',index}`. Relations are limited to entities in the batch and must be satisfied at insertion. A diameter dimension is `{type:'dimension',mode:'diameter',refs:[{key:'circle',kind:'edge',index:0}],value:40,offset:[25,25]}`.
- UI: `api.t(key)`, `api.preview(canvas,entities)`, `api.setupNumber(input)`, `api.status(text)`, `api.close()`.
- Files and geometry: `api.openFile(accept)`, `api.download(data,filename,mime)`, `api.geometry.trace(entity,scale)`, `api.geometry.length(entity)`.
- API v1 has no background or remote automation endpoint. An agent helper can pass a declarative batch to a local command for user review.
- See [developer documentation](README.md) and [working workshop](transmissions/plugin.js).
