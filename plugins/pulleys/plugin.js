'use strict';
VelocivectorPlugins.registerAsync('pulleys',async load=>{
  await Promise.all([load('transmission-core.js'),load('pulleys/messages.js')]);
  return TransmissionWorkshop.manifest(true,PulleyWorkshopMessages);
});
