//import {saxton} from '../dist/model';
let soils = {
  "sandy": {
		"area": 1000,
		"hsg": "A",
		"albedo-dry": "0.16",
		"thickness": {
			"value": 150,
			"units": "cm"
		},
		"texture": {
			"sand": 90,
			"silt": 5,
			"clay": 5
		},
		"bulk-density": {
			"value": 1.30,
			"units": "g/cm^3"
		},
		"organic-matter": {
			"value": 2,
			"units": "%"
		},
		"awc": 0.15901315789473686,
		"ksat": 7.107500000000001,
		"vwc-fc": 0.3047828947368421,
		"vwc-pwp": 0.1745328947368421,
		"vwc-sat": 0.3665131578947369,
		"horizons": [
			{
				"chkey": "63830442",
				"texture": {
          "sand": 90,
          "silt": 5,
          "clay": 5
				},
				"bulk-density": {
          "value": 1.30,
					"units": "g/cm^3"
				},
				"organic-matter": {
					"value": 2,
					"units": "%"
				},
		    "awc": 0.15901315789473686,
        "ksat": 7.107500000000001,
        "vwc-fc": 0.3047828947368421,
        "vwc-pwp": 0.1745328947368421,
        "vwc-sat": 0.3665131578947369,
				"position": {
					"top": 0,
					"thickness": 150,
					"bottom": 150,
					"units": "cm"
				}
			},
		]
	},
  "clayey": {
		"area": 1000,
		"hsg": "D",
		"albedo-dry": "0.16",
		"thickness": {
			"value": 150,
			"units": "cm"
		},
		"texture": {
			"sand": 5,
			"silt": 5,
			"clay": 90 
		},
		"bulk-density": {
			"value": 1.7,
			"units": "g/cm^3"
		},
		"organic-matter": {
			"value": 2,
			"units": "%"
		},
		"awc": 0.15901315789473686,
		"ksat": 7.107500000000001,
		"vwc-fc": 0.3047828947368421,
		"vwc-pwp": 0.1745328947368421,
		"vwc-sat": 0.3665131578947369,
		"horizons": [
			{
				"chkey": "63830442",
				"texture": {
          "sand": 5,
          "silt": 5,
          "clay": 90 
				},
				"bulk-density": {
          "value": 1.7,
					"units": "g/cm^3"
				},
				"organic-matter": {
					"value": 2,
					"units": "%"
				},
		    "awc": 0.15901315789473686,
        "ksat": 7.107500000000001,
        "vwc-fc": 0.3047828947368421,
        "vwc-pwp": 0.1745328947368421,
        "vwc-sat": 0.3665131578947369,
				"position": {
					"top": 0,
					"thickness": 150,
					"bottom": 150,
					"units": "cm"
				}
			},
		]
	},
}

/*
Object.keys(soils).forEach((key) => {
  let soil = soils[key];
  let {ll, dul, sat} = saxton(soil.texture)

  soils[key]["vwc-fc"] = dul;
  soils[key]horizons[0]["vwc-fc"] = dul;

  soils[key]["vwc-pwp"] = ll;
  soils[key]horizons[0]["vwc-pwp"] = ll;

  soils[key]["vwc-sat"] = sat;
  soils[key]horizons[0]["vwc-sat"] = sat;

  soils[key]["awc"] = dul-ll;
  soils[key]horizons[0]["awc"] = dul-ll;
}
*/

module.exports = soils;
