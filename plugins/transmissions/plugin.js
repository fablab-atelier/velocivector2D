'use strict';
VelocivectorPlugins.registerAsync('transmissions',async load=>{
  await Promise.all([load('transmission-core.js'),load('transmissions/messages.js')]);
  return TransmissionWorkshop.manifest(false,GearWorkshopMessages);
});
