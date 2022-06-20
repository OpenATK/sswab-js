/* Copyright 2021 Qlever LLC
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import convict from 'convict';
import { config as load } from 'dotenv';

load();

const config = convict({
  model: {
    soil: {
      layers: {
        surface: {
          doc: 'surface layer depth in cm',
          default: 15,
          env: "SURFACE_LAYER",
          arg: 'surface_layer'
        },
        total: {
          doc: 'total modeled depth depth in cm',
          default: 150,
          env: "TOTAL_DEPTH",
          arg: 'TOTAL_DEPTH'
        }
      }
    }
  },
  service: {
    path: {
      doc: 'Base path for the tractability service',
      default: '/bookmarks/services/tractability',
      env: 'SERVICE_PATH',
      arg: 'service_path'
    },
    name: {
      doc: 'Name of the service; used by jobs lib; helps configuring tests separately',
      default: 'tractability',
      env: 'SERVICE_NAME',
      arg: 'service_name'
    },
    weatherInterval: {
      doc: 'On this regular interval, items from the process queue that failed at some point will be reprocessed',
      format: Number,
      default: 3600000,
      env: 'WEATHER_INTERVAL',
      arg: 'weatherInterval'
    },
  },
  trellis: {
    domain: {
      doc: 'OADA API domain',
      format: String,
      default: 'proxy',
      env: 'DOMAIN',
      arg: 'domain',
    },
    token: {
      doc: 'OADA API token',
      format: Array,
      default: ['god-proxy'],
      env: 'TOKEN',
      arg: 'token',
    },
    concurrency: {
      doc: 'OADA client concurrency',
      format: Number,
      default: 1,
      env: 'CONCURRENCY',
      arg: 'concurrency'
    },
  },
});

config.validate({ allowed: 'warn' });

export default config;
