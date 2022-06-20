import _ from 'lodash';
import md5 from 'md5';
import wellknown from 'wellknown';
import soilsjs from 'soilsjs';
import wp from 'weather-prism';
import sr from 'solar-rad';
import csvjson from 'csvjson';
import fs from 'fs';
import moment from 'moment';
import { plotThings } from './plot.js';
import {computeBoundingBox} from './aoiHandler';
import testpolygon from './testpolygon.json';
import {runWaterBalance} from './model';
import config from './config';

const surface_depth = config.get('model.soil.layers.surface');
const total_depth = config.get('model.soil.layers.total');
const remaining_depth = total_depth - surface_depth;

import debug from 'debug';
const info = debug('sswab-js:info');
const trace = debug('sswab-js:trace');
const warn = debug('sswab-js:warn');

export async function main(conf?) {
  conf = conf || {
    geometry: testpolygon,
    years: [2010]
  }
  let {hash, solar, weather, soils } = await fetchAoiData(conf);

  // Sum of rainfall over the last 90 days of the year.
  let frain = Object.values(weather || {})
    //@ts-ignore
    .filter(date => moment(date).dayOfYear() >= 275)
    .reduce((sum, data: any) => 
      sum + data.pcpn,
      0
    )

  // Do some prep into a format ready for the model
  let {soils: tsoils, skipped} = translateSoilData(soils, frain);
  info('The following soil entries will be omitted due to translation errors:', skipped)
  solar = prepSolar(solar);

  //Add GHI solar value as a key under the weather time-series data
  _.merge(weather, solar)

  /*
  let sample = {
    soils: {"21644680": tsoils["21644680"] },
    weather: Object.fromEntries(Object.entries(weather).filter(([date]) => date.split('-')[1] === "06")),
  }
   */
  //@ts-ignore
  weather = Object.fromEntries(Object.entries(weather).filter(([date]) => date.split('-')[1] === "06"))
//  weather = Object.fromEntries(Object.entries(weather).filter(([date]) => parseInt(date.split('-')[1]) >= 5 && parseInt(date.split('-')[1]) <= 8))
  let balance = runWaterBalance({soils: tsoils, weather});

  // Create a property-indexed object of data arrays ready for plotting
  let bData = restructureForPlotting(balance);
  await plotThings(bData);

  //Prep data for csvjson
  let csvBalance = restructureForCsvJson(balance);
  // Write out CSV
  let out = csvjson.toCSV(csvBalance, {delimeter: ",", wrap: false, headers: "key"})
  fs.writeFileSync(`./outputs/output-balance-${hash}.csv`, out);

  //Write out JSON
  info(`Run complete. Output data: ./outputs/output-balance-${hash}.json`);
  fs.writeFileSync(`./outputs/output-balance-${hash}.json`, JSON.stringify(balance))

  // Make output plots
//  await makePlots(csvBalance);
}

function restructureForCsvJson(balance) {
  let data : any = [];
  Object.keys(balance).forEach(soilkey => {
    Object.keys(balance[soilkey]).sort().forEach(date => {
      let item = balance[soilkey][date]
      item = Object.assign({}, item);
      item.soil = soilkey;
      item.moisture0 = item.moisture[0];
      item.moisture1 = item.moisture[1];
      item.moisture2 = item.moisture[2];
      item.moisture3 = item.moisture[3];
      item.unsatflow0= item.flows[0];
      item.unsatflow1= item.flows[1];
      item.unsatflow2= item.flows[2];
      item.date = Date.parse(date);
      item.textdate = date;
      delete item.moisture;
      delete item.flows;
      delete item.all;

      data.push(item)
    })
  })
  return data;
}

//TODO: Make it work for multiple soils
function restructureForPlotting(balance) {
  let balKeys = Object.keys(balance);
  if (!balKeys) throw new Error('No balance outputs');
  //@ts-ignore
  let bObjArr = _.sortBy(Object.values(balance[balKeys[0]]), (v) => v.time)
  console.log({bObjArr});
  console.log(balKeys[0]);
  //let bObjArr = _.sortBy(Object.values(balance["21644680"]), (v) => v.time)
  let bData:any = {};
  console.log('11111', bObjArr[1])
  Object.keys(bObjArr[1]).forEach(key => {
    if (key === 'moisture') {
      bData.moisture = [];
      bObjArr[1].moisture.forEach((v, i) => {
        trace("DING", v);
        bData.moisture[i] = bObjArr.map(obj => obj[key][i])
      })
    } else {
      bData[key] = bObjArr.map(obj => obj[key]);
    }
  })
  return bData;
}

// Flatten soil data down to abstract away the complexity from IFSM. IFSM just
// wants a set of soils.
export function translateSoilData(soils, frain) {
  info(`Preparing the soil information for the model`);
  let out = {};
  let skipped : Array<string> = [];
  Object.keys(soils.component || {}).forEach(cokey => {
    let component = soils.component[cokey];
    try {

      out[cokey] = {
        area: component.aggregate.area.value,
        hsg: component.hydgrp,
        'albedo-dry': component.albedodry_r,
        thickness: component.aggregate.chorizon.hzthk_r.sum,
        texture: {
          sand: component.aggregate.chorizon.sandtotal_r.value,
          silt: component.aggregate.chorizon.silttotal_r.value,
          clay: component.aggregate.chorizon.claytotal_r.value,
        },
        'bulk-density': component.aggregate.chorizon.dbthirdbar_r.value,
        'organic-matter': component.aggregate.chorizon.om_r.value,
        awc: component.aggregate.chorizon.awc_r.value,
        ksat: component.aggregate.chorizon.ksat_r.value,
        'vwc-fc': (component.aggregate.chorizon.wthirdbar_r.value || component.aggregate.chorizon.wtenthbar_r.value)/100,
        'vwc-pwp': component.aggregate.chorizon.wfifteenbar_r.value/100,
        'vwc-sat': component.aggregate.chorizon.wsatiated_r.value/100,
        horizons: [],
      }

      out[cokey].porosity = getPorosity(out[cokey]['bulk-density']);
      out[cokey].swcon = getDrainageCoefficient(out[cokey].porosity, out[cokey]['vwc-fc']);

      //3. Get horizons
      Object.keys(component.chorizon || {}).sort().forEach((chkey,h) => {
        let horizon = soils.chorizon[chkey];
        //3a. Store horizon data
        out[cokey].horizons[h] = {
          chkey,
          texture: {
            sand: parseFloat(horizon.sandtotal_r),
            silt: parseFloat(horizon.silttotal_r),
            clay: parseFloat(horizon.claytotal_r),
          },
          'bulk-density': {
            value: parseFloat(horizon.dbthirdbar_r),
            units: 'g/cm^3',
          },
          'organic-matter': {
            value: parseFloat(horizon.om_r),
            units: '%'
          },
          awc: parseFloat(horizon.awc_r),
          ksat: parseFloat(horizon.ksat_r),
          'vwc-fc': parseFloat(horizon.wthirdbar_r || horizon.wtenthbar_r)/100,
          'vwc-pwp': parseFloat(horizon.wfifteenbar_r)/100,
          'vwc-sat': parseFloat(horizon.wsatiated_r)/100,
          position: {
            top: parseFloat(horizon.hzdept_r),
            thickness: parseFloat(horizon.hzthk_r),
            bottom: parseFloat(horizon.hzdepb_r),
            units: 'cm',
          }
        }
      })

      // Ignore because ssurgo already reports this.
      /*
      if (out[cokey].texture.sand > 40) {
        out[cokey].constant = 0.5
      } else out[cokey].constant = 0.4;

      // O.M. bulk density correction factor
      out[cokey].xz = out[cokey]['organic-matter'].value*0.0172;
      out[cokey].bdm = (1 - out[cokey].xz)/(1/out[cokey]['bulk-density'].value-out[cokey].xz/0.224);

      // Factors for effect of texture on DUL and LL
      if (out[cokey].texture.sand > 75) {
        out[cokey].w1 = 0.19-0.0017*out[cokey].texture.sand;
        out[cokey].w2 = 0.429-0.00388*out[cokey].texture.sand;
      } else if (out[cokey].texture.silt > 70) {
        out[cokey].w1 = 0.16;
        out[cokey].w2 = 0.1079+0.000504*out[cokey].texture.silt;
      } else {
        out[cokey].w1 = 0.0542+0.00409*out[cokey].texture.clay;
        out[cokey].w2 = 0.1079+0.000504*out[cokey].texture.silt;
      }
      out[cokey].pd = 2.65; // particle density (g/cm3);
      out[cokey].po = 1-(out[cokey]['bulk-density'].value/out[cokey].pd);
     */

      // Use out[cokey].awc as its been corrected for fragments and salinity
//        let awc = out[cokey]['vwc-fc'] - out[cokey]['vwc-pwp'];

      let params = getFrainSoilParams(out[cokey], frain)
      Object.assign(out[cokey], params);

      out[cokey].swef = 0.9-0.00038*Math.pow(3-30, 2) // (depth water/depth out[cokey])

      out[cokey].layers = [
        {
          depth: 0,
          dlayr: 3, //cm
        }, {
          depth: 3,
          dlayr: 4.5, //cm
        }, {
          depth: 7.5,
          dlayr: 7.5, //cm
        }, {
          depth: 15.0,
          dlayr: 135, //cm
        }
      ]
    } catch(err) {
      warn(`TranslateSoils errored on cokey ${cokey}. Skipping and removing from model run.`)
      delete out[cokey]
      skipped.push(cokey)
      trace(err)
    }
  })

  let template = {
    /*
    bdm: {
      description: "maximum compacted bulk density",
      units: "g/cm3",
    },
    w1: {
      description: "factors for effect of soil texture on LL and DUL",
      units: "g/cm3",
    },
    w2: {
      description: "factors for effect of soil texture on LL and DUL",
      units: "g/cm3",
    },
    pd: {
      description: "particle density",
      units: "g/cm3",
    },
    po: {
      description: "porosity",
      units: "%",
    },
   */
    whc1: {
      description: "water holding capacity in upper soil layers",
      units: "%",
    },
    whc2: {
      description: "water holding capacity in lower soil layers",
      units: "%",
    },
    /*
    por1: {
      description: "total pore space in upper soil layers",
      units: "mm",
    },
    por2: {
      description: "total pore space in lower soil layers",
      units: "mm",
    },
   */
    faw: {
      description: "fraction/ratio of available water content over last 90 days of the year?",
      units: "%"
    },
    depth: {
      description: "effective depth of modeling",
      units: "in",
    },
    /*
    diff: {
      description: "only gets used for certain crop types; difference between rooting depth and soil depth",
      units: "in"
    },
     */
    'organic-matter': {
      units: '%'
    },
    'bulk-density': {
      units: 'g/cm3'
    },
    ws1: {
      description: "water capacity modified by FAW for upper soil",
      units: "in"
    },
    ws2: {
      description: "water capacity modified by FAW for lower soil",
      units: "in"
    },
    aw: {
      description: "available water through the whole soil depth",
      units: "in",
    },
    awi: {
      description: "available water through the crop root depth. same as aw if roots go through modeled soil region",
      units: "in",
    },
    swef: {
      description: "soil water evaporation fraction. Fraction that result in lowest possible water content on surface layer due to evaporation.",
      units: "1",
    },
    porosity: {
      description: "Percent pore space by volume",
      units: "%",
    },
    swcon: {
      description: "Soil drainage rate constant",
      units: "1/day",
    }
/*
    xz: {
     description: "correction factor for O.M. density",
     units: "1"
    }
   */
  }

  return { soils:out, skipped, template }
}

export function getPorosity(bd) {
  return 1 - (bd/2.65);
}

export function getDrainageCoefficient(porosity, dul) {
  return (porosity-dul)/porosity;
}

export function getFrainSoilParams(soil, frain) {
  let whc1 = (soil.awc)*surface_depth/2.54; // inches
  let whc2 = (soil.awc)*remaining_depth/2.54; // inches

  let faw = Math.min(1, 0.3+0.7*frain/(whc1+whc2)) //inches/inches
  //TODO: Crop rooting depth here instead of 150;
  let depth = Math.min(150, soil.thickness.value)/2.52; //in

//  soil.diff = Math.max(0, soil.depth-120) //in

  let ws1 = faw*whc1; //in
  let ws2 = faw*whc2; //in
  let aw = ws1 + ws2;
  let awi = faw*(soil.awc)*depth/2.54; //in

  return {awi, aw, ws1, ws2, faw, whc1, whc2, depth};
}

export async function fetchAoiData(conf) {
  //1. If the data is saved out, read it in.
  let {centroid} = computeBoundingBox(conf.geometry.features[0]);

  let con = {
    soils: [
      wellknown.stringify(conf.geometry.features[0]),
      {aggregate: true}
    ],
    weather: {
      lat: centroid[0],
      lon: centroid[1],
      years: conf.years
    },
    solar: {
      lat: centroid[0],
      lon: centroid[1],
      api_key: 'u5rF5UlzDoZ8z0wjjYTh5xOh3KELK99l74XLCn7l',
      years: conf.years,
      email: 'sanoel@purdue.edu',
    }
  }

  let hash = md5(con);
  let filepath = `./inputs/inputs-${hash}.json`;
  info(`Checking for input file: ${ filepath}`)

  if (fs.existsSync(filepath)) {
    info(`Found previously saved file ${filepath}`);
    //@ts-ignore
    return {hash, ...JSON.parse(fs.readFileSync(filepath))};
  } else {
    //Fetch it from scratch
    let soils = await soilsjs.fromWkt(...con.soils);
    let {data: weather, template: wtemp} = await wp.fetch(con.weather);
//    let solar = JSON.parse(fs.readFileSync('./inputs/solar-daily2010.json'));
    let {data: solar, template: stemp } = await sr.fetch(con.solar);
    solar = sr.aggregate(solar, 'daily');
    //Now save it out
    let templates = {
      [wtemp.id]: wtemp,
      [stemp.id]: stemp
    };
    fs.writeFileSync(filepath, JSON.stringify({soils, weather, solar, templates}))
    info(`Saved solar, weather, and soils to file ${filepath}`);
    return {hash, soils, weather, solar, templates}
  }
}

function prepSolar(data) {
  let conversion = 24*0.0036; // W/m2 * 24 hours/day * 0.0036 MJ/Wh = MJ/m2 on that day
  let solar = {};
  Object.keys(data || {}).sort().forEach((date) => {
    solar[date] = {ghi: data[date].GHI*conversion}
  })
  return solar
}

if (require.main === module) {
  main();
} else {
  info('Just importing');
}
