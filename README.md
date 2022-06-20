sswab-js

Simple Soil Water Balance. An module that takes in weather, soils, and solar data, and runs a water balance consisting of runoff, infiltration, evapotranspiration, unsaturated flow, and deep percolation. The model returns the additions/losses through each process as well as the soil moisture represented in 4 layers (0-3cm, 3-7.5cm, 7.5-15cm, 15-150cm).
soils, and 
## Installation

```console
$ npm install sswab-js
```

## Usage
Require the module:

```js
const balance = require('sswab-js')
```


## CLI
Run the CLI:
```
sswab-js
```
