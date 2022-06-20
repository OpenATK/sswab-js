import { expect } from 'chai';
import fs from 'fs';
import _ from 'lodash';
import { layers, saxton, availableWater, unsaturatedFlow, evapotranspiration, runoff, infiltration } from '../dist/model.js';
import { getDrainageCoefficient, getPorosity, getFrainSoilParams, translateSoilData } from '../dist/index.js'
import testpolygon from './testpolygon.json';
import dummySoils from './dummySoils';
import realInputs from './realInputs.json';
import config from '../src/config';

const tdepth = config.get('model.soil.layers.total');

describe('Water balance unit testing', function() {
  this.timeout(100000);

  before(async () => {
  });

  after(async () => {
  });


  it(`Saxton`, async () => {
    this.timeout(100000);
    let {dul, ll, sat} = saxton(dummySoils.sandy.texture);

    expect(dul).to.be.gt(0)
    expect(ll).to.be.gt(0)
    expect(sat).to.be.gt(0)

    expect(dul).to.be.lt(1)
    expect(ll).to.be.lt(1)
    expect(sat).to.be.lt(1)

    expect(dul).to.be.gt(ll)
    expect(sat).to.be.gt(ll)
    expect(sat).to.be.gt(dul)
  });

  it(`Soil translation`, async () => {
    this.timeout(100000);
    let s = realInputs.soils;
    s.mapunit = Object.fromEntries(Object.entries(s.mapunit).filter(([key]) => key === "164263"));
    let frain = 10; //inches, about average for October-December
    let {soils} = translateSoilData(s, frain);

    Object.values(soils).forEach(soil => {
      //parameters that are some fraction of soil depth
      expect(soil.depth).to.be.gt(0).and.lte(tdepth);
      expect(soil.whc1).to.be.gt(0).and.lte(tdepth);
      expect(soil.whc2).to.be.gt(0).and.lte(tdepth);
      expect(soil.whc1+soil.whc2).to.equal(soil.awc*tdepth/2.54);

      // This faw and frain nonsense is wierd and not well explained.
      expect(frain).to.be.gte(1).and.lt(100);
      expect(soil.faw).to.be.gt(0).and.lte(1);

      //VWCs
      expect(soil.ws1).to.be.gt(0).and.lte(soil.whc1);
      expect(soil.ws2).to.be.gt(0).and.lte(soil.whc2);

      expect(soil.aw).to.be.gt(0).and.lte(soil.awc*tdepth/2.54);
      expect(soil.awi).to.be.gt(0).and.lte(soil.awc*tdepth/2.54);
      expect(soil.swef).to.be.gt(0).and.lte(0.9);

    })
  });

  it(`Runoff`, async () => {
    this.timeout(100000);
    let frain = 10;
    let soil = dummySoils.sandy;

    //Not enough rainfall to register runoff
    let result = runoff({
      p: 0.5,//inches
      soil,
      moisture: [0.2,0.2,0.2,0.2],
    })
    expect(result.cn).to.be.approximately(51, 1.0)
    expect(result.q).to.be.approximately(0.0, 0.0001);
    expect(result.q).to.be.gte(0).and.lte(result.p);
    expect(result.cn).to.be.gte(result.cn1dry).and.lte(result.cn3wet);

    //Considerable rainfall; unsaturated soil
    result = runoff({
      p: 1.5,//inches
      soil,
      moisture: [0.2,0.2,0.2,0.2],
    })
    expect(result.cn).to.be.approximately(51, 1.0)
    expect(result.q).to.be.approximately(0.0, 0.01);
    expect(result.q).to.be.gte(0).and.lte(result.p);
    expect(result.cn).to.be.gte(result.cn1dry).and.lte(result.cn3wet);

    // Soil is saturated. Runoff should be equal to rainfall
    result = runoff({
      p: 1.5,//inches
      soil,
      moisture: (new Array(4)).fill(soil["vwc-sat"]),
    })
    expect(result.cn).to.be.approximately(83, 1.0)
    expect(result.q).to.be.approximately(0.4, 0.01);
    expect(result.q).to.be.gte(0).and.lte(result.p);
    expect(result.cn).to.be.gte(result.cn1dry).and.lte(result.cn3wet);

    // Soil is at field capacity. Should still wet up further, but runoff should occur
    result = runoff({
      p: 1.5,//inches
      soil,
      moisture: (new Array(4)).fill(soil["vwc-fc"]),
    })
    expect(result.cn).to.be.approximately(67, 1.0)
    expect(result.q).to.be.approximately(0.048, 0.01);
    expect(result.q).to.be.gte(0).and.lte(result.p);
    expect(result.cn).to.be.gte(result.cn1dry).and.lte(result.cn3wet);


    // Soil is extremely dry
    result = runoff({
      p: 1.5,//inches
      soil,
      moisture: [0,0,0,0],
    })
    expect(result.cn).to.be.approximately(47, 1.0)
    expect(result.q).to.be.approximately(0, 0.01);
    expect(result.q).to.be.gte(0).and.lte(result.p);
    expect(result.cn).to.be.gte(result.cn1dry).and.lte(result.cn3wet);

  });

  it(`Infiltration`, async () => {
    this.timeout(100000);
    let soil = dummySoils.sandy;
    soil.porosity = getPorosity(soil["bulk-density"].value);
    soil.swcon = getDrainageCoefficient(soil.porosity, soil['vwc-fc']);
    console.log({swcon: soil.swcon, por: soil.porosity, saturation: soil['vwc-sat'], fc: soil['vwc-fc']});

    let result = infiltration({
      soil,
      moisture: [0,0,0,0],
      infiltration: 0.5
    })
    console.log('1', result);
    expect(result.drain).to.be.gte(0).and.lte(0.5);

    //0 Infiltration -> 0 drainage

    //Push 1 inch into saturated soil
    result = infiltration({
      soil,
      moisture: (new Array(4)).fill(soil["vwc-sat"]),
      infiltration: 1.0
    })
    console.log('2', result);
    //Because of soil drainage rate, the bottom layer will also contribute water to exit the bottom
    expect(result.drain).to.be.gte(1.0, 0.01);
  });

  it(`availableWater`, async () => {
    this.timeout(100000);
    //First check inputs
    let soil = dummySoils.sandy;
    let frain = 10; //inches, about average for October-December
    let params = getFrainSoilParams(soil, frain)
    Object.assign(soil, params);

    let maxaw = soil.depth*(soil['vwc-sat']-soil["vwc-pwp"]); //max inches of water held
    expect(soil.awi).to.be.gte(0).and.lte(maxaw)
    soil.porosity = getPorosity(soil["bulk-density"].value);
    soil.swcon = getDrainageCoefficient(soil.porosity, soil['vwc-fc']);
    let result = availableWater({
      moisture: [0,...(new Array(3)).fill(soil["vwc-pwp"])],
      soil,
    })
    let maxasm = (soil['vwc-sat']); //max inches of water held
    //TODO: Look into this if upper soil vwc-sat could be greater than whole-soil vwc-sat
    let maxasm1 = (soil['vwc-sat']); //max inches of water held
    expect(result.aw).to.be.gte(0).and.lte(maxaw);
    expect(result.asm).to.be.gte(0).and.lte(maxasm);
    expect(result.asm1).to.be.gte(0).and.lte(maxasm1);
    expect(result.ws1).to.be.gte(0).and.lte(maxaw);
    expect(result.ws2).to.be.gte(0).and.lte(maxaw);

    result = availableWater({
      moisture: (new Array(4)).fill(soil["vwc-sat"]),
      soil,
    })
    maxasm = (soil['vwc-sat']); //max inches of water held
    //TODO: Look into this if upper soil vwc-sat could be greater than whole-soil vwc-sat
    maxasm1 = (soil['vwc-sat']); //max inches of water held
    expect(result.aw).to.be.gte(0).and.lte(maxaw);
    expect(result.asm).to.be.gte(0).and.lte(maxasm);
    expect(result.asm1).to.be.gte(0).and.lte(maxasm1);
    expect(result.ws1).to.be.gte(0).and.lte(maxaw);
    expect(result.ws2).to.be.gte(0).and.lte(maxaw);
  });

  it(`Evapotranspiration`, async () => {
    this.timeout(100000);
    //First check inputs
    let soil = dummySoils.sandy;
    soil.porosity = getPorosity(soil["bulk-density"].value);
    let frain = 10; //inches, about average for October-December
    Object.assign(soil, getFrainSoilParams(soil, frain));
    soil.swcon = getDrainageCoefficient(soil.porosity, soil['vwc-fc']);
    let moisture = (new Array(4)).fill(soil["vwc-fc"]);
    let {aw} = availableWater({
      moisture,
      soil
    });
    let {all: et} = evapotranspiration({
      moisture,
      aw,
      weather: {
        maxt: 75,
        mint: 47,
        ghi: 250, //MJ/m2 - high: ~275-375; low: 0-70
      },
      lai: 2, // generally 1 - 4.5
      winf: 0.5,
      soil,
    })

    let maxPotentialETRate = 50; //(in/d)
    let maxPotentialET = 50; //(in)
    let maxUpperSM = soil["vwc-sat"]*15/2.54;
    expect(et.albedo).to.be.gte(0).and.lte(1);
    expect(et.eeq).to.be.gte(0).and.lte(maxPotentialETRate);
    expect(et.eo).to.be.gte(0).and.lte(maxPotentialET)
    expect(et.eos).to.be.gte(0).and.lte(50);
    if (et.esx) expect(et.esx).to.be.gte(0).and.lte(soil["vwc-sat"])
    expect(et.escf).to.be.gte(0.5).and.lte(1)
    expect(et.eeq).to.be.gte(0).and.lte(100)
    expect(et.U).to.be.gte(3/25.4).and.lte(20/25.4)

    expect(et.sumes1).to.be.gte(0).and.lte(100)
    expect(et.sumes2).to.be.gte(0).and.lte(soil["vwc-sat"])

    expect(et.ep2).to.be.gte(0).and.lte(soil["vwc-sat"]*4.5/2.54);
    expect(et.ep3).to.be.gte(0).and.lte(soil["vwc-sat"]*7.5/2.54);
    expect(et.ep4).to.be.gte(0).and.lte(soil["vwc-sat"]*135/2.54);

    expect(et.moisture[0]).to.be.gte(0).and.lte(soil["vwc-sat"])
    expect(et.moisture[1]).to.be.gte(0).and.lte(soil["vwc-sat"])
    expect(et.moisture[2]).to.be.gte(0).and.lte(soil["vwc-sat"])
    expect(et.moisture[3]).to.be.gte(0).and.lte(soil["vwc-sat"])

    expect(et.es).to.be.gte(0).and.lte(soil["vwc-sat"]*150/2.54)
    expect(et.ep).to.be.gte(0).and.lte(soil["vwc-sat"]*150/2.54)
    expect(et.et).to.be.gte(0).and.lte(soil["vwc-sat"]*150/2.54)
    // If LAI goes up, transpiration should go up and soil evap should reduce.
    let {all: et2} = evapotranspiration({
      moisture,
      aw,
      weather: {
        maxt: 75,
        mint: 47,
        ghi: 250, //MJ/m2 - high: ~275-375; low: 0-70
      },
      lai: 4.5, // generally 1 - 4.5
      winf: 0.5,
      soil,
    })
    expect(et2.ep).to.be.gte(et.ep);
    expect(et2.es).to.be.lte(et.es);
    // If temperatures go up, evaporation should go up
    let {all: et3} = evapotranspiration({
      moisture,
      aw,
      weather: {
        maxt: 95,
        mint: 67,
        ghi: 350, //MJ/m2 - high: ~275-375; low: 0-70
      },
      lai: 4.5, // generally 1 - 4.5
      winf: 0.5,
      soil,
    })
    expect(et3.es).to.be.gte(et2.es);
    expect(et3.et).to.be.gte(et2.et);
    //If the soil is at pwp and water is not added via winf, ep should be low
    moisture = (new Array(4)).fill(soil["vwc-pwp"]);
    ({aw} = availableWater({
      moisture,
      soil
    }));
    let {all: et4} = evapotranspiration({
      moisture,
      aw,
      weather: {
        maxt: 95,
        mint: 67,
        ghi: 350, //MJ/m2 - high: ~275-375; low: 0-70
      },
      lai: 4.5, // generally 1 - 4.5
      winf: 0.0,
      soil,
    })
    console.log({et3, et4})
    expect(et4.ep).to.equal(0)
    expect(et4.et).to.be.lte(et3.et)
  });

  it(`Unsaturated Flow`, async () => {

    let soil = dummySoils.sandy;
    soil.porosity = getPorosity(soil["bulk-density"].value);
    let frain = 10; //inches, about average for October-December
    Object.assign(soil, getFrainSoilParams(soil, frain));
    soil.swcon = getDrainageCoefficient(soil.porosity, soil['vwc-fc']);
    let moisture = [0.18,0.2, 0.3, 0.2];
    let result = unsaturatedFlow({
      moisture,
      soil
    })
    console.log({moisture, new: result.moisture});

    expect(result.moisture[0]).to.be.gte(moisture[0]);
    expect(result.moisture[1]).to.be.gte(moisture[1]);
    expect(result.moisture[2]).to.be.lte(moisture[2]);
    expect(result.moisture[3]).to.be.gte(moisture[3]);
    //Mass balance check; water should be redistributed, not added/subtracted to overall volume
    let sumBefore = moisture.reduce((sum, item, i) => sum += (item*layers[i].dlayr));
    let sumAfter = result.moisture.reduce((sum, item, i) => sum += (item*layers[i].dlayr));
    expect(sumBefore).to.be.approximately(sumAfter, 0.1);
  })
});

// Some tests to write up:
// 1) Verify that subsurface layers cannot have moisture below the lower limit;
// 2)
