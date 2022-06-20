process.env.NODE_TLS_REJECT_UNAUTHORIZED="0";
import _ from 'lodash';
import { expect } from 'chai';
import { setTimeout } from 'timers/promises';
import { fetch, aggregate } from 'solar-rad';
import moment from 'moment';

import { createNewAoi, missingDataReport, toJson, toCsv, fetchWeather, fetchNsrdb, fetchSoils } from '../src/aoiHandler';
import geometry from './testpolygon.json';

describe('Lots of tests', function() {
  this.timeout(100000);
//  let oada: OADAClient

  before(async () => {
//    oada = await connect({domain: DOMAIN, token: TOKEN});
    //initialize()
    await setTimeout(15000/2)
  });

  after(async () => {
  });

  it(`Should fetch soils on new AOI`, async () => {
    this.timeout(100000);
    // Post new resource containing 'geometry' and link it into the aoi-index
    let soils = await fetchSoils(geometry);
    toJson(soils, 'soils-test.json')
    expect(soils).to.include.keys(['mapunit']); 
  });

  //TODO 
  it(`Should report missing data segments if a day is missing from daily data`, async () => {
    this.timeout(100000);
    //Create some arbitrary {data: { key: {time: moment.format()}} data with some missing segments
    let data = {}
    for (let i = 0; i < 100; i++) {
      let time = moment('1998').add(i, 'days').format();
      data[time] = {time}
    }
    let delDays = moment('1998').add(65, 'days').format();
    delete data[delDays]
    let missing = await missingDataReport(data, 24*3600*1000)// 60 min in milliseconds
    expect(missing.entries).to.include.keys(['1998-03-07T00:00:00-05:00']); 
    expect(missing["gap-size"]).to.include.keys(['1']); 
    expect(missing["gap-size"]["1"]).to.equal(1); 
  });

  it(`Should report missing data segments, even if crossing DST boundary`, async () => {
    this.timeout(100000);
    //Create some arbitrary {data: { key: {time: moment.format()}} data with some missing segments
    let data = {}
    for (let i = 0; i < 365; i++) {
      let time = moment('1992').add(i, 'days').format('YYYY-MM-DD');
      time = moment(time).format();
      data[time] = {time}
    }
    expect(data).to.include.keys(['1992-04-05T00:00:00-05:00'])
    expect(data).to.include.keys(['1992-04-06T00:00:00-04:00'])
    let missing = await missingDataReport(data, 24*3600*1000)// 60 min in milliseconds
    expect(Object.keys(missing.entries)).to.be.empty; 
    expect(Object.keys(missing["gap-size"])).to.be.empty; 
  });

  it(`Should fetch solar on new AOI`, async () => {
    this.timeout(100000);
    //TODO: Change this so that the time period is specified here so the test results
    // will remain consistent over time;

    let {data, template, daily, missing, dmissing} = await fetchNsrdb({
      api_key: 'u5rF5UlzDoZ8z0wjjYTh5xOh3KELK99l74XLCn7l',
      years: _.range(1998, 1999),
      email: 'sanoel@purdue.edu',
      geometry,
    })
    expect(Object.keys(missing.entries)).to.be.not.empty; 
    expect(missing["gap-size"]).to.include.keys(['24', '72']);
    expect(missing["gap-size"]['24']).to.equal(4);
    expect(missing["gap-size"]['72']).to.equal(1);

    expect(Object.keys(dmissing.entries)).to.be.not.empty; 
    expect(dmissing["gap-size"]).to.include.keys(['1', '3']); 
    expect(dmissing["gap-size"]['3']).to.equal(1); 
    expect(dmissing["gap-size"]['1']).to.equal(4); 
    
    toCsv(data, 'solar-hourly.csv')
    toCsv(daily, 'solar-daily.csv')
  });

  it(`Should fetch weather data on new AOI`, async () => {
    this.timeout(100000);
    let {data} = await fetchWeather(geometry, _.range(1998, 2002));
    let missing = await missingDataReport(data, 24*3600*1000)// day in milliseconds
    expect(Object.keys(missing.entries)).to.be.empty; 
    expect(Object.keys(missing["gap-size"])).to.be.empty; 
    toCsv(data, 'weather-daily.csv')
  });

  it(`Should gather everything on a new AOI`, async () => {
    this.timeout(100000);

    let merged = await createNewAoi(geometry);
    console.log(merged);
    expect(Object.keys(missing.entries)).to.be.empty; 
    expect(Object.keys(missing["gap-size"])).to.be.empty; 
  });
});
