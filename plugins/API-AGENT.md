# Velocivector Plugins API v1

- Entry point: `plugins/<id>/plugin.js`, called once at startup by `Lancer.cmd`. ID regex: `^[a-z][a-z0-9-]{0,47}$`.
- Register synchronously with `VelocivectorPlugins.register({id,apiVersion:1,messages,commands,workshops,importers,exporters,postprocessors})`.
- Local dependencies: `VelocivectorPlugins.registerAsync(id, async load => { await load('id/library.js'); return manifest; })`. The path is relative to `plugins/`.
- Ship your own `messages[language][key]` catalogs. Plugin language and defaults are stored per ID. `api.language()` returns its active language. `api.toolDefault(key,fallback)` reads only its settings.
- Declare `preferences:[{key,label,default,options?,min?,max?,prefix?}]` and `about:{version,description,authors,license}`. A boolean default renders a checkbox. Description and labels are translation keys. Supply `ui.workshop`, `ui.preferences`, `ui.about`, `ui.close`, `ui.automatic`, `ui.language`, `ui.reset` and `ui.next` in each plugin catalog.
- Entries have unique `id` and a `title` translation key.
  - Command: `run(api)`.
  - Workshop: `mount(element,api,snapshot?) => cleanupFunction | {snapshot(),dispose?()} | undefined`. Language changes remount with the last snapshot when supplied.
  - For every workshop with a preview and report, the report takes priority. Mount a direct `plugin-workspace` child with a flexible preview area and a final `plugin-report` child pinned at the bottom. Let the preview area change aspect ratio to fit the remaining space. Keep geometry undistorted. Let long reports scroll independently.
  - The workshop opens in the top-right at full available width, with content-driven height capped at the viewport. The host handles title-bar dragging, bottom-right resizing, viewport bounds, scrolling and stored per-workshop geometry. Mount content into the provided element. Observe the container for resize-sensitive previews. Supply `ui.move` and `ui.resize` in plugin catalogs.
  - Importer: `accept`, `read(File,api) => batch | null`. `batch.units` defaults to `document`.
  - Exporter / postprocessor: `extension` including dot, `mime`, `write(drawing,{includeConstruction},api) => string | Blob | ArrayBuffer | typed array`.
- Read: `api.drawing()`, `api.selection()`, `api.activeLayer()`, `api.units()`.
- Write: `api.insert({entities,constraints?,layers?:string[]},{layer?,units?:'document'|'mm',offset?:[x,y]}) => ids[]`. When creating layers, set each entity.layer to a label from layers. Name collisions are suffixed. Undo is atomic. Entity coordinate system is Y-up. Primitive angular parameters use radians.
- Entity batch keys are optional strings. The fallback key is the decimal array index. A reference is `{key,kind:'point'|'edge',index}`. Relations are limited to entities in the batch and must be satisfied at insertion. A diameter dimension is `{type:'dimension',mode:'diameter',refs:[{key:'circle',kind:'edge',index:0}],value:40,offset:[25,25]}`.
- Optional `vectorGroup` values group entities within the insertion. The host remaps group identifiers on each insertion.
- UI: `api.t(key)`, `api.preview(canvas,entities)`, `api.setupNumber(input)`, `api.status(text)`, `api.close()`.
- Files and geometry: `api.openFile(accept)`, `api.download(data,filename,mime)`, `api.geometry.trace(entity,scale)`, `api.geometry.length(entity)`.
- API v1 has no background or remote automation endpoint. An agent helper can pass a declarative batch to a local command for user review.
- See [developer documentation](README.md) and [working workshop](transmissions/plugin.js).

- Parametric workshops can call `api.readDrawing(raw)` to validate a VCV, `api.insertDrawing(source)` to insert a native drawing with layers, relations and unit conversion, and `api.openDrawing(source,name,fileHandle?,onSave?)` to open an editable source after the standard replacement check. The optional save callback receives the written VCV text when saving back to the same file.
