if (process.env.LOCAL) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import csvjson from 'csvjson';
import fs from 'fs';
let Promise = require('bluebird');
let moment = require('moment');
const _ = require('lodash');
import soilsjs from 'soilsjs';
import solar from 'solar-rad';
let weather = require('weather-prism');
import wkt from 'wellknown'
import debug from 'debug';

const info = debug(`sswab-js:info`);
const trace = debug(`sswab-js:trace`);

export async function createNewAoi(geometry: any) {
  let {centroid} = computeBoundingBox(geometry.features[0]);
  let years = _.range(1998, 2002);
  let {data} = await weather.fetch({
    lat: centroid[0],
    lon: centroid[1],
    years,
  })
  let missingp = await missingDataReport(data);

  let {dmissing} = await fetchNsrdb({
    api_key: 'u5rF5UlzDoZ8z0wjjYTh5xOh3KELK99l74XLCn7l',
    years,
    email: 'sanoel@purdue.edu',
    geometry,
  });

  let merged = await mergeMissingDataReports([{
    report: dmissing,
    name: 'solar'
  }, {
    report: missingp,
    name: 'prism'    
  }])

  return merged
}//createNewAoi

async function fetchWeather(geometry: any, years) {
  let {centroid} = computeBoundingBox(geometry.features[0]);

  return weather.fetch({
    lat: centroid[0],
    lon: centroid[1],
    years
  })
}

export async function fetchSoils(geometry:any) {
  //1. Determine if the soils data is up
  //1b. If not, fetch it
  //2. Link it in
  let wktStr = wkt.stringify(geometry.features[0]);
  return soilsjs.fromWkt(wktStr)
}

export async function fetchNsrdb({geometry, api_key, years, email}) {
  let {centroid} = computeBoundingBox(geometry.features[0]);
  let {data, template } = await solar.fetch({
    lat: centroid[0],
    lon: centroid[1],
    api_key,//: 'u5rF5UlzDoZ8z0wjjYTh5xOh3KELK99l74XLCn7l',
    years,//: _.range(1998, 1999),
    //name: 'Sam+Noel',
    //reason: 'educational+tools',
    //affiliation: 'Purdue+University',
    email,//: 'sanoel@purdue.edu',
  })

  let missing = await missingDataReport(data);

  let daily = await solar.aggregate(data, 'daily');  
  let dmissing = await missingDataReport(daily);

  return {data, template, daily, missing, dmissing}

}

export function computeBoundingBox(geometry) {
  let bbox;
  let coords = geometry.geometry.coordinates[0];
  let north = coords[0][1];
  let south = coords[0][1];
  let east = coords[0][0];
  let west = coords[0][0];
  (geometry.geometry.geometries || [geometry.geometry]).forEach(g =>
    g.coordinates[0].forEach(c => {
      if (c[1] > north) north = c[1];
      if (c[1] < south) south = c[1];
      if (c[0] > east) east = c[0];
      if (c[0] < west) west = c[0];
    })
  )
  bbox = {north, south, east, west};
  let centroid = [(bbox.north + bbox.south)/2, (bbox.east + bbox.west)/2];
  return { bbox, centroid };
}

// This thing should arbitrarily handle any temporal resolution
// It returns both the missing data elements and which position in a consecutive
// set of missing values that they were. It also returns the count of instances
// of consecutive values missing.
async function missingDataReport(data, interval?) {
  // Make a first pass, come up with an array of the intervals between times;
  // Find the mode of that 

  let vals: Array<{time: string}> = Object.values(data)
  let entries : Array<{time: string}> = vals.length > 99 ? vals.slice(0, 100) : vals;
  let ints = {};
  for (let i = 1; i < entries.length-1; i++) {
    let cur = entries[i]!.time;
    let prev = entries[i-1]!.time;
    let inter = moment(cur) - moment(prev);
    ints[inter] = ints[inter] ? ints[inter]++ : 1;
  }
  interval = parseInt(Object.keys(ints).reduce((a, b) => ints[a] > ints[b] ? a : b));

  let missing = {entries: {}, "gap-size": {}, interval};
  let previous;
  await Promise.each(Object.keys(data).sort(), async (i) => {
    let consecutive = 0;
    let cur = moment(data[i].time)
    if (previous && (cur - previous) !== interval) {

      //First check if this is due to DST
      //e.g., moment('1992-04-05') vs moment('1992-04-06') is not a 24 hour difference due to DST
      let pidst = previous.isDST();
      let cidst = cur.isDST();
      if (pidst !== cidst) {
        // if exiting DST, a missing interval will have a gap > 
        if (pidst && cur - previous === interval+3600000) {
          info(`Detected change from DST to ST. Not reporting as a gap. ${cur}, ${previous}`)
          previous = cur.clone();
          return
        } else if (cidst && cur - previous === interval-3600000) {
          info(`Detected change from ST to DST. Not reporting as a gap. ${cur}, ${previous}`)
          previous = cur.clone();
          return
        }
      }

      trace(`Bad interval. Previous:${previous.format()}; Next:${cur.format()}; Gap:${cur - previous}; Interval:${interval}`)
      let next = previous.clone().add(interval)
      while (next < cur) {
        consecutive++;
        info(`Missing time:${next}; Consecutive missing:${consecutive}`)
        missing.entries[next.format()] = {
          time: next.format(),
          consecutive
        }
        next = next.add(interval);
      }
      if (consecutive > 0) {
        missing["gap-size"][consecutive] = missing["gap-size"][consecutive] + 1 || 1;
      }
    } 
    previous = cur.clone();
  })

  return missing;
}

async function mergeMissingDataReports(reports) {
  let output = {
    entries: {},
    "gap-size": {},
  };
  if (reports.some(({interval}) => interval !== reports[0].interval)) {
    throw new Error('Missing data reports are not all based on the same interval')
  }
  await Promise.each(reports, async ({report, name}) => {
    Object.entries(report.entries).forEach(([key, val]) => {
      //@ts-ignore
      output.entries[key] = Object.assign(val, {type: name});
    })
    Object.entries(report["gap-size"]).forEach(([key, val]) => {
      //@ts-ignore
      output.entries[key] = Object.assign(val, {type: name});
    })
  })

  return output;
}

function toJson(data, fname) {
  fs.writeFileSync(`outputs/${fname}`, JSON.stringify(data));
}

function toCsv(data, fname) {
  let out = csvjson.toCSV(Object.values(data), {delimiter: ",", wrap: false});
  fs.writeFileSync(`outputs/${fname}`, out);
}

module.exports = {
  fetchSoils,
  fetchNsrdb,
  fetchWeather,
  missingDataReport,
  toCsv,
  toJson,
  mergeMissingDataReports,
  createNewAoi,
  computeBoundingBox
}
