//const _ = require('lodash');
import moment from 'moment';
import debug from 'debug';

const info = debug('sswab-js:water-balance:info');
const trace = debug('sswab-js:water-balance:trace');
const warn = debug('sswab-js:water-balance:warn');

export const layers = [
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

// From Ceres Maize Manual
let CnTable = {
  'straight-row': {
    'poor': {
      'A': 72,
      'B': 81,
      'C': 88,
      'D': 91
    },
    'good': {
      'A': 67,
      'B': 78,
      'C': 85,
      'D': 89
    }
  }
}

//From SCS via IFSM
function getCn(hsg) {
  if (hsg.length > 1) hsg = hsg.slice(0,1);
  return CnTable['straight-row']['good'][hsg];
}

//From SWAT via IFSM
function getDryWetCN(cn2) {
  let c2 = 100 - cn2
  let cn1dry = cn2 - (20*c2/(c2+Math.exp(2.533-0.0636*c2)))
  cn1dry = Math.max(cn1dry, 0.4*cn2);
  let cn3wet = cn2*Math.exp(0.006729*c2);
  return {cn1dry, cn3wet};
}

/*
Inputs
  p: rainfall amount (in)
  soil: soil objects containing:
    cn1dry: curve number dry soil
    cn2: scs curve number
    cn3wet: curve number wet soil
    cnl: crop-specific curve number override (not used)
    sat: saturation VWC of the soil (depth water/depth soil)
    dul: drained upper limit (field capacity) VWC of the soil (depth water/depth soil)
    ll: lower limit (wilting point) VWC of the soil (depth water/depth soil)
    layers: Object of layer data containing:
      dlayr: thickness of each soil layer (cm)
      sw: water content of each layer (depth water/depth soil);
  moisture: water content (%) corresponding to each layer in soil.layers

Intermediate values
  cumDep: current/cumulative depth (cm)
  cnpw: curve number parameter for wet soil
  cnpd: curve number parameter for dry soil
  wx: depth-dependent weighting factor
  wf: layer weighting factor
  xx: daily snowmelt?
  pe: rainfall excess (cm)

Output:
  runoff depth

Notes:
  Runoff is only affected by the soil layers down to RUNOFF_AFFECTED_DEPTH. The
  computation of depth-weighted CNs is done in cm, but function outputs effective
  rainfall depth in inches.
*/

let RUNOFF_AFFECTED_DEPTH = 45; //(cm)
export function runoff({p, soil, moisture, cnl = undefined}) {
  //  if (!(p > 0)) return 0.0; short circuit early
  let {hsg} = soil;

  // Compute CNs
  let cn2 = getCn(hsg);
  let {cn1dry, cn3wet} = getDryWetCN(cn2);

  let sat = soil['vwc-sat'];
  let dul = soil['vwc-fc'];
  let ll = soil['vwc-pwp'];

  let cnpw = 0.0;
  let cnpd = 0.0;

  let cn, wx, wf;
  if (!cnl) {
    //Get VWC at saturation, field capacity, and pwp
    let cumDep = 0.0;
    let xx = 0.0;
    layers.forEach((layer, l) => {
      let sw = moisture[l];
      if (cumDep <= RUNOFF_AFFECTED_DEPTH) {
        cumDep += layer.dlayr;
        cumDep = cumDep > RUNOFF_AFFECTED_DEPTH ? RUNOFF_AFFECTED_DEPTH : cumDep;
        wx = 1.016*(1.0-Math.exp(-4.16*cumDep/RUNOFF_AFFECTED_DEPTH));
        wf = wx - xx;
        xx = wx;
        cnpw += ((sw-dul)/(sat-dul))*wf;
        cnpd += ((sw-ll)/(dul-ll))*wf;
      }
    })
    cnpw = cnpw < 0 ? 0 : cnpw;
    cnpd = cnpd < 0 ? 0 : cnpd;
    cnpw = cnpw > 1.0 ? 1.0 : cnpw;
    cnpd = cnpd > 1.0 ? 1.0 : cnpd;

    //cnpd > 1 indicates wet soil
    cn = cnpd >= 1.0 ? cn2+((cn3wet-cn2)*cnpw) : cn1dry + ((cn2-cn1dry)*cnpd)
  } else cn = cnl;

  if (cn <= 0.0) cn = 0.99;
  if (cn > 100) cn = 100;

  let s = (1000/cn - 10); //inches
  //s *= 25.4 // convert to mm
  let ia = 0.2*s;
  let pe = p - ia;
  return {
    p,
    q: pe > 0 ? Math.pow(pe, 2)/(pe + s) : 0.0, //inches; same as (p-0.2s)^2 / (p+0.8s)
    s,
    ia,
    pe,
    cn,
    cn1dry,
    cn2,
    cn3wet,
    cnpd,
    cnpw,
    wf,
    wx
  };
}

//Compute water-holding parameters based only on soil texture
export function saxton({sand, clay}) {
  let sat = 0.332 - 7.251*(Math.pow(10, -4)*sand) + (0.1276*Math.log10(clay))
  let a = Math.exp((-4.396-0.0715*clay)-(4.88*Math.pow(10,-4)*sand*sand)-(4.285*Math.pow(10, -5)*sand*sand*clay))
  let b = -3.14 - (0.00222*clay*clay) - (3.484*Math.pow(10, -5)*sand*sand*clay);
  let dul = Math.pow(0.3333/a, 1/b);
  let ll = Math.pow(15/a, 1/b);
  return {ll, dul, sat}
}

function fToC(degreesF) {
  return (degreesF - 32)*(5/9);
}

function getResidueCover() {
  // Assume conventional cover for now
  return 0.2;
}

//Look into AVHRR Land LAI mapping
//https://www.ncei.noaa.gov/data/avhrr-land-leaf-area-index-and-fapar/access/2022/
//simple function to get LAI
function getLAI(day) {
  let planting = 120; // day plant growth begins
  let growthDays = 80; // might need adjustment
  let harvest = 300; // two months prior to year end
  let maxLAI = 5;
  let minLAI = 0.25; //

  // Now compute
  if (day < planting || day > harvest) {
    // Prior to planting or after harvest
    return minLAI;
  } else if (day < planting+growthDays) {
    // Growth stage; basic exponential growth
    let b = Math.pow((maxLAI/minLAI), (1/growthDays)); //final LAI after growth
    let x = day - planting;
    return minLAI*Math.pow(b,x);
  } else if (day < harvest) {
    // Full plants until harvest
    return maxLAI;
  }
}

/*
  Inputs
    winf: infiltration (in)
    lai: leaf area index (integer % leaf coverage)
    soil: see runoff soil input
    moisture: water content corresponding to each layer in soil.layers (depth water/depth soil)
    aw: available water (depth water/depth soil)
    weather: 
      maxt: maximum temperature (deg F)
      mint: minimum temperature (deg F)
      ghi: solar radiation (MJ/m2)

  Intermediate Values
    eeq: equilibrium evaporation rate (in)
    sumes1: sum of evaporation in stage 1
    sumes2: sum of evaporation in stage 2
    es: actual soil evaporation (in)
    eo: potential evapotranspiration (in)
    eos: potential soil evaporation rate (in)
    eeq: equilibrium evaporation rate for computing potential ET (in/d)
    rldf: root length density factor per layer
    wr: root growth weight factor per layer
    swdf: soil water deficit factor for root growth per layer
    swef: soil water evaporation fraction, minimum fraction of the lower limit of the surface layer that be reduced by evaporation
    swr: plant extractable water (in)
    rtdep: rooting depth (in)
    whc1: water holding capacity in top 12 inches (in)
    whc2: water holding capacity in lower root zone (in)
    stress:
    td: weighted mean temperature 60/40 max/min (deg C)
    escf:
    U: soil-specific upper limit of stage 1 soil evaporation (mm/d) - ranges from 6 - 12 mm (Ritchie 1972)
    esx: temporary soil evaporation variable (in/d)
    t: Time after 2nd stage soil evaporation is reached (d)
    ep2 - ep4: transpiration in layers 2,3, and 4 (in)

  Outputs
    moisture: water content corresponding to each layer in soil.layers (depth water/depth soil)
    es: evaporation (in)
    ep: transpiration (in)
    et: evapotranspiration (in)
*/ 

//TODO: evap is not defined in most ssurgo monthly data
export function evapotranspiration({moisture, weather, lai, winf, soil, aw}) {

  let etWinf = winf; //(in)
  if (!(layers && layers[0] && layers[1] && layers[2] && layers[3])) throw new Error("Bad layers")
  let {maxt, mint, ghi: rad} = weather;
  maxt = fToC(maxt); //Celcius
  mint = fToC(mint);
  let U = 9/25.4; //(in)
  let { swef } = soil;
  let ll = soil['vwc-pwp'];
  let dul = soil['vwc-fc'];
  let newMoisture = new Array(4);
  let es;
  
  //Potential evap
  let td = 0.6*maxt+0.4*mint;
  let albedo = 0.23-(0.23 - soil['albedo-dry'])*Math.exp(-0.75*lai);
  //EEQ from IFSM code does not match CERES book. The values 0.00488 and 0.00437
  //are off by a factor of 23.92 and 23.88, respectively (i.e., 24 hours per day?).
  //Wierd, because even if that is the case 2.04e-4 * 24 is 0.00490, not 0.00488.
  //Either way, potential evaporation should be on the order of single-digit mms
  //per day, or single-digit inches per month in the summer.
  //let eeq = (rad*(0.00488-0.00437*albedo)*(td+29))/25.4; //(in)
  let eeq = (rad*(0.00488-0.00437*albedo)*(td+29))/25.4/24; //(in)
  let eo = (maxt > 35) ? eeq*((maxt-35)*0.05+1.1)
    : (maxt < 5) ? eeq*0.01*Math.exp(0.18*(maxt+20))
      : eeq*1.1; // (in)

  //Assume non-forage crop (crop > 4 in IFSM)
  let eos = (lai < 1) ? eo*(1-0.43*lai) //negative linear slope as a function of LAI
    : eo/1.1*Math.exp(-0.4*lai); // (in) positive exponential slope as a function of LAI

  let residue = getResidueCover();

  // Now compute actual evap
  let swr = Math.max(0, (moisture[0] - ll)/(dul - ll));
  let sumes1, sumes2, t, esx;
  let escf = 1 - 0.5*residue;

  // compute stage 1 and 2 ET
  if (swr >= 1.0) {
    sumes1 = 0.0;
    sumes2 = 0.0;
    t = 0.0;
  } else if (swr >= 0.9) {
    //100 mm of sumes1 by default??
    sumes1 = (100 - swr*100)/25.4; // (in);
    //sumes1 = 100 - swr*100 No explanations
    sumes2 = 0;
    t = 0;
  } else {
    sumes1 = U;
    sumes2 = Math.max(0, 25-27.8*swr)/25.4; //(in);
    t = Math.pow(sumes2/3.5, 2);
  }

  //
  if (sumes1 >= U) {
    if (etWinf >= sumes2) {
      etWinf = etWinf - sumes2;
      sumes1 = (etWinf > U) ? 0 : U - etWinf;
      t = 0;
      sumes1 = sumes1+eos;
      es = (sumes1 > U) ? eos-0.4*(sumes1 - U) : eos;
    } else if (etWinf < sumes2) {
      t += 1;
      es = Math.pow(3.5*t, 0.5) - sumes2;
      if (etWinf > 0) {
        esx = 0.8*etWinf;
        if (esx <=es) esx = es+etWinf;
        es = Math.min(eos, esx)
      } else if (es > eos) {
        es = eos
      }
      sumes2 += es-etWinf;
      t = Math.pow(sumes2/3.5, 2)
    }
  } else { // combined the final two elses of the original IFSM source code
    sumes1 = (etWinf >= sumes1) ? eos : sumes1-etWinf+eos;
    es = (sumes1 > U) ? escf*(eos-0.4*(sumes1-U)) : escf*eos;
  }
  es = es < 0 ? 0 : es;
  let first = layers[0].dlayr/2.54; //(in)

  es = Math.min(es, (0.3*(dul-ll) + Math.max(0, moisture[0]-dul))*first); //(in)
  newMoisture[0] = moisture[0] - es/first;

  let es1;
  if (newMoisture[0] < ll*swef) {
    es1 = (ll*swef-newMoisture[0])*first; // (in)
    newMoisture[0] = ll*swef;
    es = Math.max(0, es-es1); // (in)
  }

  // Plant-extracted moisture from lower layers
  let ep = (lai <= 3) ? eo*(1.0-Math.exp(-lai)) : eo; //(in)
  // per IFSM manual, stress begins below critical soil moisture threshold
  // "normally set at half the available water-holding capacity in the root zone"
  ep = Math.min(ep, eo*aw/(soil.awc*0.5*(soil.whc1+soil.whc2)));

  //TODO CO2, TRATIO, and STRESS are a mystery in the code. After fixing, uncomment
  //the two lines pertaining to TRATIO
  //Limit ep based on plant condition
//  let tratio = 1.24-0.000914*CO2+(-0.237+0.00094*CO2)*lai/(0.378+lai);
//  ep = Math.min(ep, eo*aw/(stress*(soil.whc1+soil.whc2)));
  if (ep+es > eo) ep = eo-es;
  //ep = Math.max(ep, 0.01*tratio);

  // Distribute transpiration down through the soil layers:
  // 15% from 2nd layer, 25% from third, remainder from fourth
  let ep2 = Math.min((moisture[1] - ll)*layers[1].dlayr/2.54, 0.15*ep); // (in)
  let ep3 = Math.min((moisture[2] - ll)*layers[2].dlayr/2.54, 0.25*ep); // (in)
  let ep4 = Math.min((moisture[3] - ll)*layers[3].dlayr/2.54, ep-ep2-ep3); // (in)

  newMoisture[1] = moisture[1]-(ep2/layers[1].dlayr/2.54) //cm/cm
  newMoisture[2] = moisture[2]-(ep3/layers[2].dlayr/2.54) //cm/cm
  newMoisture[3] = moisture[3]-(ep4/layers[3].dlayr/2.54) //cm/cm

  ep = ep < 0 ? 0 : ep;
  es = es < 0 ? 0 : es;
  let et = es + ep;

  return {
    moisture: newMoisture,
    et,
    es,
    ep,
    all: {moisture: newMoisture, et, es, ep, albedo, td, eos, eo, eeq, sumes1,
      sumes2, ep2, ep3, ep4, swr, escf, esx, residue, etWinf, first, es1,
      swef,
    }
  };
}

/* Infiltration
 * The balance taking place between each layer is essentially two components:
 * 1) The distribution of incoming water into layers and
 * 2) The contribution of drainage rates to move that water below
  Inputs 
   soil: see runoff soil input
   moisture: water content corresponding to each layer in soil.layers (depth water/depth soil)
   winf: infiltration (in)

  Intermediate Values
    sw: vwc of soil layer (depth water/depth soil)
    sat: saturated vwc (depth water/depth soil)
    vwc-pwp: permanent wilting point - lower limit of vwc (depth water/depth soil)
    vwc-fc: field capacity - drained upper limit of vwc (depth water/depth soil)
    hold: available water-holding capacity of the soil given current state (in)
    flux: moisture flow between layers (in);
    ksat: saturated hydraulic conductivity - converted to (in/day)
    depth: soil layer depth (in)
    swcon: soil drainage rate constant (1/d) 

  Outputs
    wleach: depth of water leached from the profile
    wleachs: depth of water leached from the surface
    wleach1: depth of water leached from the bottom
    moisture
    drain: depth of water drained via nonsaturated flow (in/day)

*/

//ksatConv = 1um/s * 3600s/hr * 24hr/day * cm/10000um  * in/2.54cm => in/day
//  let ksatConv = 3600*24/10000/2.54;
//  let ksat = soil.ksat * ksatConv;//in/day
export function infiltration({soil, moisture, infiltration: winf}) {
  let drain;
  /*
  let wleach;
  let wleachs;
  let wleach1;
  */
  let flux = winf; // (in)
  let {swcon} = soil; //(1/day)
  let sat = soil['vwc-sat'];
  let fc = soil['vwc-fc'];
  let newMoisture : any = [];
  layers.forEach((layer, l) => {
    newMoisture[l] = moisture[l];
    let depth = layer.dlayr/2.54; // (in)
    let hold = (sat - newMoisture[l])*depth; // (in)
    if (flux == 0 || flux <= hold) {
      newMoisture[l] += flux/depth; // (in/in)
      // New moisture exceeds field capacity; it should drain
      if (newMoisture[l] > fc + 0.003) {
        drain = (newMoisture[l] - fc)*swcon*depth;// (in/day)
        newMoisture[l] -= drain/depth; // (in/in)
      } else {
        drain = 0;
      }
      flux = drain;
    } else {
      // Added water is in excess of saturation;
      drain = (sat - fc)*swcon*depth;
      newMoisture[l] = sat - drain/depth;
      // flux to next layer is the balance PLUS the drainage of this layer to the next
      flux = flux-hold+drain;
    }
    /* This is all unnecessary unless used in other modules
    // Suface soil layer
    if (l === 0) wleachs = drain; // (in)
    // 2nd to bottom soil layer
    if (l === 2) wleach1 = drain; // (in)
    // Bottom soil layer
    if (l === moisture.length -1) wleach = drain; // (in)
     */
  })

  return {/*wleachs, wleach1, wleach, */moisture: newMoisture, flux, drain}
}
/*
 *
 *
 * asm1 - available soil moisture - upper soil portion (%)
 * asm - available soil moisture - lower soil portion (%)
 * ws1 - available soil moisture - upper portion (in)
 * ws2 - available soil moisture - lower portion (in)
 * aw - available soil moisture - whole soil-ws1+ws2 (in)
 * awi - available soil moisture - whole soil (in)
 */
export function availableWater({soil, moisture}) {
  let depths = layers.map(l => l.dlayr/2.54); // inches
  if (!(depths[0] && depths[1] && depths[2] && depths[3])) throw new Error('Bad depths during availableWater');
  let ll = soil['vwc-pwp'];
  //Notice the subsurface layers do not have Math.max. i.e., it has not
  //protection for cases where moisture[l]-ll is negative
  let ws1 = (Math.max(0, moisture[0]-ll)*depths[0])+(moisture[1]-ll)*depths[1]+(moisture[2]-ll)*depths[2];
  let ws2 = (Math.max(0, moisture[3]-ll)*depths[3]);
  let asm1 = ws1/(depths[0]+depths[1]+depths[2]);
  let aw = ws1+ws2;
  let asm = aw/(depths[0]+depths[1]+depths[2]+depths[3]);
  let extra_aw = Math.max(0, aw-soil.awi)
  return {aw, asm1, asm, ws1, ws2, extra_aw}
}

export function unsaturatedFlow({soil, moisture}) {
  let newMoisture = [...moisture];
  let depths = layers.map(l => l.dlayr/2.54); // inches
  if (!(depths[0] && depths[1] && depths[2] && depths[3])) throw new Error('Bad depths during availableWater');
  let ll = soil['vwc-pwp'];
  let flows : Array<number> = [];
  depths.slice(0, 3).forEach((depth, l) => {
    let m = l + 1;
    let nextDep = depths[m];
    if (!nextDep) throw new Error('nextDep undefined')
    // Compute dbar diffusivity; a function of current moisture levels
    let thet1 = Math.max(0, newMoisture[l]- ll)
    let thet2 = Math.max(0, newMoisture[m]- ll)
    let dbar = Math.min(100, 0.88*Math.exp(35.4*((thet1*depth+thet2*nextDep)/(depth+nextDep))));
    //let dbar = Math.min(100, 0.88*Math.exp(35.4*(thet1+thet2)*0.5));//from CERES Maize book
    let flow = dbar*(thet2-thet1)/((depth+nextDep)*0.5);

    // Diffusivity sets the bounds of flow, but this code limits flow to the mid-
    // point between the two layer moistures
    if (flow < 0) { //newMoisture[l] > newMoisture[m], water moves downward
      flow = Math.max(flow, 0.5*(newMoisture[m]-newMoisture[l])*depth);
    } else { //newMoisture[l] < newMoisture[m], water moves upward
      flow = Math.min(flow, 0.5*(newMoisture[m]-newMoisture[l])*nextDep);
    }
    flows[l] = flow;
    newMoisture[l] = newMoisture[l]+(flow/depth);
    newMoisture[m] = newMoisture[m]-(flow/nextDep);
  })
  return {moisture: newMoisture, flows}
}

// The general approach for soils is to abstract the complexity of soils away.
// This will just take a keyed set of soil objects and process them. The implications
// and weighting for outputs is to be handled later.
export function runWaterBalance({weather, soils}) {
  let balance = {};
  let previous = {};

  Object.keys(soils || {}).forEach(soilkey => {
    info(`Running water balance on soil ${soilkey}`)
    let soil = soils[soilkey];
    balance[soilkey] = balance[soilkey] || {};

    Object.keys(weather || {}).sort().forEach(date => {
      let doy = moment(date).dayOfYear()
      info(`Processing Soil: ${soilkey} Date:${date}; DOY:${doy}`);

      //Check for, then assign weather data
      if (!weather[date]) {
        warn(`Weather missing:${date}`)
        return;
      }
      let dayWeather = weather[date];
      balance[soilkey][date] = balance[soilkey][date] || {};
      let bal = balance[soilkey][date];
      Object.assign(bal, dayWeather);
      trace('Weather: ', dayWeather);
      bal.precip = dayWeather.pcpn; //inches


      // Initialize moisture content
      // TODO: revise this to address any holes in data;
      let previousDate = moment(date).subtract(1, 'day').format('YYYY-MM-DD');
      previous[soilkey] = balance[soilkey][previousDate];
      if (!previous[soilkey]) {
        info(`(Re)initializing soil moisture for soil: ${soilkey}.`);
        previous[soilkey] = {
          moisture: Array(4).fill(soil.faw*(soil['vwc-fc']-soil['vwc-pwp'])+soil['vwc-pwp'])
        }

        let avail = availableWater({
          soil,
          moisture: previous[soilkey].moisture,
        });
        Object.assign(previous[soilkey], avail);
        trace('Initializing Available Water:', avail)
      }


      // Compute runoff and water entering soil
      let runoffOutputs = runoff({
        p:dayWeather.pcpn, 
        soil,
        moisture: previous[soilkey].moisture
      }); //inches
      bal.runoff = runoffOutputs.q;
      bal.infiltration = Math.max(0, bal.precip - bal.runoff); //inches
      trace('Runoff:', runoffOutputs);

      // Compute infiltration and moisture through soil layers
      let infiltrationOutputs = infiltration({
        soil,
        moisture: previous[soilkey].moisture,
        infiltration: bal.infiltration
      });
      Object.assign(bal, infiltrationOutputs);
      trace('Infiltration:', infiltrationOutputs)


      let lai = getLAI(doy)
      bal.lai = lai;
      let etOutputs = evapotranspiration({
        moisture: bal.moisture,
        weather: dayWeather,
        lai,
        winf: bal.infiltration,
        soil,
        aw: previous[soilkey].aw,
      })
      //@ts-ignore
      delete etOutputs.all;
      Object.assign(bal, etOutputs);
      trace('ET:', etOutputs)

       // Compute available soil moisture
      let unsat = unsaturatedFlow({
        soil,
        moisture: bal.moisture,
      });
      Object.assign(bal, unsat);
      trace('Unsaturated Flow:', unsat)

      // Compute available soil moisture
      let avail = availableWater({
        soil,
        moisture: bal.moisture,
      });
      Object.assign(bal, avail);
      trace('Available Water:', avail)

      // Save previous for next iteration
      balance[soilkey][date] = bal;
    })
  })
  return balance
}

/* Glossary
###Initialization
bdm - maximum compacted bulk density (g/cm3)
w1 and w2 - factors for effect of soil texture on LL and DUL ()
pd - particle density (g/cm3)
po - porosity (%)
whc1 - water holding capacity (upper) (%)
whc2 - water holding capcity (remaining) (%)
por1 - total pore space in upper layer (mm)
por2 - total pore space in lower layer (mm)
faw - conditional factor for available water content in the fall? ()
depth - effective depth of modeling (cm)
diff - only gets used for certain crop types; difference between rooting depth and soil depth (cm)
ws1 - water capacity modified by FAW for upper soil(%)
ws2 - water capacity modified by FAW for lower soil(%)
xz - correction factor for O.M. density

###Infiltration
winf: infiltration (in)
lai: leaf area index (integer % leaf coverage)
soil: see runoff soil input
moisture: water content corresponding to each layer in soil.layers (depth water/depth soil)
aw: available water (depth water/depth soil)
solar: solar radiation (MJ/m2)
weather: 
  maxt: maximum temperature (deg F)
  mint: minimum temperature (deg F)

Intermediate Values
eeq: equilibrium evaporation rate (mm/)
sumes1: sum of evaporation in stage 1
sumes2: sum of evaporation in stage 2
es: actual soil evaporation (mm)
eo: potential evapotranspiration (in)
eos: potential soil evaporation rate (mm/)
eeq: equilibrium evaporation rate (mm/)
rldf: root length density factor per layer
wr: root growth weight factor per layer
swdf: soil water deficit factor for root growth per layer
swef: soil water evaporation fraction, minimum fraction of the lower limit of the surface layer that be reduced by evaporation
swr: plant extractable water (mm)(in)
rtdep: rooting depth (in)
whc1: water holding capacity in top 12 inches (in)
whc2: water holding capacity in lower root zone (in)
stress:
td: weighted mean temperature 60/40 max/min (deg C)
escf: 

Outputs
moisture: water content corresponding to each layer in soil.layers (depth water/depth soil)
es: evaporation (in)
ep: transpiration (in)
et: evapotranspiration (in)

Main Water Balance Subroutine

*/
