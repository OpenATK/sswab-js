import chalk from 'chalk';
import fs from 'fs';
import _ from 'lodash';
import gjv from 'geojson-validation'
import figlet from 'figlet';
//import { runWaterBalance } from './model';
import arg from 'arg';
//import { fetchAoiData } from './index';
import { projectInstall } from 'pkg-install';
import Listr from 'listr';
import inquirer from 'inquirer';
import inquirerFileTreeSelection from 'inquirer-file-tree-selection-prompt';

inquirer.registerPrompt('file-tree', inquirerFileTreeSelection)

const point = {
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [-86.988438, 40.477494]
  }
}
const demoOptions = {
  location: point,
  years: [2010],
  output: 'demo-data'
}

async function promptForMissingOptions(options) {

  //First, handle demo case
  let demoQuestions:any = [];
  if (options.demo) {
    return demoOptions /*{
      ...options,
      location: point,
      years: [2010]
    };*/
  } else if (!Object.values(options).some(i => i)) {
    demoQuestions.push({
      type: 'list',
      name: 'mode',
      message: 'Which model would you like to run?',
      choices: ['Demo', 'New Model Run'],
      default: 'Demo',
    });
  }
  const demoAnswer = await inquirer.prompt(demoQuestions);

  if (demoAnswer.mode === "Demo") {
    return demoOptions
  }


  // Okay, not demo. Proceed with other questions.
  const questions:any = [];
  if (!options.location) {

    questions.push({
      type: 'list',
      name: 'location-type',
      message: 'What sort of location will be provided?',
//      when: (answers) => answers['location1'] === "New Location",
      choices: ['GeoJSON File', 'GeoJSON String Input', 'Latitude/Longitude Input'],
      default: ['Latitude/Longitude Input'],
    });

    questions.push({
      type: 'file-tree',
      name: 'loc-file',
      message: 'Input the geojson file',
      when: (answers) => answers['location-type'] === "GeoJSON File",
//      validate: (input) => gjv.valid(JSON.parse(fs.readFileSync(input, 'utf8'))) || "File does not parse as valid GeoJSON",
      default: "./dist/testpolygon.json",
    });

    questions.push({
      type: 'input',
      name: 'loc-gjson',
      message: 'Input a valid geojson string',
      when: (answers) => answers['location-type'] === "GeoJSON Input",
      validate: (input) => gjv.valid(JSON.parse(input)) || "Input string is not valid GeoJSON",
      filter: (input) => JSON.parse(input),
      default: JSON.stringify(point),
    });

    questions.push({
      type: 'input',
      name: 'loc-lat',
      message: 'Input the latitude longitude location.',
      when: (answers) => answers['location-type'] === 'Latitude/Longitude Input',
      validate: (input) => parseFloat(input) !== NaN && input <= 90 && input >= -90 || "Latitude string must be a float value in (-90, 90)",
      default: 40.477494,
    });

    questions.push({
      type: 'input',
      name: 'loc-lon',
      message: 'Input the latitude longitude location.',
      when: (answers) => answers['location-type'] === 'Latitude/Longitude Input',
      validate: (input) => parseFloat(input) !== NaN && input <= 180 && input >= -180 || "Longitude string must be a float value in (-90, 90)",
      default: -86.988438,
    });
  }

  // YEARS
  if (!options.startYear) {
    questions.push({
      type: 'input',
      name: 'startYear',
      message: 'Input the start year.',
      validate: (input) => parseInt(input) !== NaN && parseInt(input) >= 1998 && parseInt(input) <= (options.endYear || new Date().getFullYear()) || `Year must be between 1998 and ${options.endYear || new Date().getFullYear()}`,
      default: 2010,
    });
  }

  if (!options.endYear) {
    questions.push({
      type: 'input',
      name: 'endYear',
      message: 'Input the end year.',
      when: (answers) => answers.mode !== 'Demo',
      validate: (input, answers) => parseInt(input) !== NaN && parseInt(input) >= parseInt(options.startYear || answers.startYear) && parseInt(input) <= new Date().getFullYear() || `Year must be >= start year and <= ${new Date().getFullYear()}.`,
      default: 2010,
    });
  }

  if (!options.output) {
    questions.push({
      type: 'input',
      name: 'output',
      //basePath: './outputs',
      message: 'Enter the output file name (to result in .csv and .json files in ./outputs).',
      when: (answers) => answers.mode !== 'Demo',
      default: 'test-output',
    });
  }

  const answers = await inquirer.prompt(questions);
  let results = handleAnswers({...options,...answers});

  return {
    ...results
  };
}

function handleAnswers(results) {
  if (results["loc-lat"] && results["loc-lon"]) {
    let location = _.clone(point);
    _.set(location, 'geometry.coordinates', [results["loc-lon"], results["loc-lat"]]);
    results.location = location;
  }

  if (results["loc-file"]) {
    results.location = JSON.parse(fs.readFileSync(results["loc-file"], 'utf8'))
  }

  if (results.startYear && results.endYear) {
    results.years = _.range(results.startYear, results.endYear+1)
  }

  return results;
}

function handleLocation(input) {
  let location;
  //1. Is it a filepath
  try {
    if (/.json$/.test(input)) {
      let file = JSON.parse(fs.readFileSync(input, 'utf8'));
      if (gjv.valid(file)) {
        location = file;
      }
    } else if (gjv.valid(JSON.parse(input))) {
      location = JSON.parse(input);
    }
  } catch (err) {
    throw new Error(`'--location' argument was invalid`);
  }

  if (!location) throw new Error(`'--location' argument was invalid`);

  return location;
}

function parseArgumentsIntoOptions(rawArgs) {
  const args = arg(
    {
      '--demo': Boolean,
      '--startYear': Number,
      '--endYear': Number,
      '--output': String,
      '--location': handleLocation,

      //Aliases
      '-s': '--startYear',
      '-e': '--endYear',
      '-o': '--output',
      '-l': '--location',
    },
    {
      argv: rawArgs.slice(2),
    }
  );
  return {
    demo: args['--demo'] || false,
    location: args['--location'],
    startYear: args['--startYear'],
    endYear: args['--endYear'],
    output: args['--output'],
  };
}

async function run(options) {

  const tasks = new Listr([
    {
      title: 'Install dependencies',
      task: () =>
        projectInstall({
        cwd: options.targetDirectory,
      }),
      skip: () =>
        !options.runInstall
          ? 'Pass --install to automatically install dependencies'
          : undefined,
    },/* {
      title: 'Gathering model inputs',
      task: async () =>
        await fetchAoiData({
          geometry: options.location,
          years: options.years
      }),
      skip: () =>
        !options.runInstall
          ? 'Pass --install to automatically install dependencies'
          : undefined,
    },
      */
    //{
    //title: 'Run the model',
    //task: async () => 
    //  await runWaterBalance({}),
    //skip: () =>
    //  !options.runInstall
    //   ? 'Pass --install to automatically install dependencies'
    //   : undefined,
    //}
  ]);

  await tasks.run();
}

export async function cli(args) {
  console.log(
    chalk.blue(
      figlet.textSync('sswab-js', {
        font: 'Doom'
      })
    )
  )
  let options = parseArgumentsIntoOptions(args)
  options = await promptForMissingOptions(options);
//  console.log('Final Set:', options)
  await run(options);
}
