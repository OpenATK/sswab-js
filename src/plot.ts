let moment = require('moment');
//let Highcharts = require('highcharts');
let fs = require('fs');
let exporter = require('highcharts-export-server');

export async function plotStuff(timeseries, key, y1Title, y2Title) {
  let times = Object.keys(timeseries).sort();
  let st = moment(times[0]);
  let start = {
    year: st.year(),
    month: st.month(),
    day: st.day()
  }
  let data = Object.values(timeseries).map((obj:any) => obj[key]);
  let cumuData:any = [];
  data.forEach((val, i) => {
    cumuData[i] = i === 0 ? val : cumuData[i-1] + val;
  })

  let pointStart = Date.UTC(start.year, start.month, start.day);
  let options = {
    chart: {
      zoomType: 'x'
    },
    title: {
      text: y1Title
    },
    xAxis:{
      type: 'datetime',
        maxZoom: 3 * 24 * 3600000,
         labels: {
          style: {
              color: '#000000',
                fontSize: '14px'
            }
        }
    },
    yAxis:[{
      title:{
          text: y1Title,
            style: {
              fontSize: '14px'
             },
        },
        labels: {
          style: {
              color: '#000000'
            }
        }
     },{
        title:{
          text: y2Title,
            style: {
              color: '#F00000',
              fontSize: '14px'
            },
        },
        labels: {
          style: {
            color: '#000000'
          }
        },
        min: 0,
        opposite: true
    }],
    series:[{
        name: y1Title,
        color: '#0404B4',
        type: 'column',
        data,
        pointStart,
        pointInterval: 24 * 3600 * 1000,
    },{
        name: y2Title,
        color: '#F00000',
        yAxis: 1,
        type: 'line',
        data: cumuData,
        pointStart,
        pointInterval: 24 * 3600 * 1000,
        marker: {enabled: false},
    }]
  }
  await exportChart(options, 'Test.png');
}

export async function exportChart(options, name) {
  return new Promise((resolve, reject) => {
    exporter.export({type: "png",scale: 2, options},(err, res) => {
      if (err) {
        reject(err);
      } else {
        let im = res.data;
        fs.writeFileSync(`./outputs/highcharts/${name}`, im, 'base64', (error) => {
          reject(error)
        })
      }
      resolve(res)
    })
  })
}

export async function precipTempGdd(data) {
  let st = moment(data.time[0]);
  let start = {
    year: st.year(),
    month: st.month(),
    day: st.day()
  }
  let pointStart = Date.UTC(start.year, start.month, start.day);

  let cGdd : any= [];
  data.gdd.forEach((val, i) => {
    cGdd[i] = i === 0 ? val : cGdd[i-1] + val;
  })
  let options = {
    chart: {
        zoomType: 'xy'
    },
    title: {
        text: 'Temperature, GHI, and GDDs',
        align: 'center'
    },
    xAxis:{
      type: 'datetime',
        maxZoom: 3 * 24 * 3600000,
         labels: {
          style: {
              color: '#000000',
                fontSize: '14px'
            }
        }
    },
    yAxis: [{ // Primary yAxis
        labels: {
            format: '{value}°F',
            style: {
                color: '#000000',
            }
        },
        title: {
            text: 'Temperature',
            style: {
                color: '#000000',
            }
        },
        opposite: true

    }, { // Secondary yAxis
        gridLineWidth: 0,
        title: {
            text: 'Rainfall',
            style: {
                color: '#F00000',
            }
        },
        labels: {
            format: '{value} in',
            style: {
                color: '#F00000',
            }
        }

    }, { // Tertiary yAxis
      gridLineWidth: 0,
      title: {
        text: 'Cumulative Growing Degree Days (Base 50°F)',
        style: {
          color: '#00F000',
        }
      },
      labels: {
        format: '{value} ',
        style: {
          color: '#00F000',
        }
      },
      opposite: true
    }],
    legend: {
      layout: 'vertical',
      align: 'left',
      x: 60,
      verticalAlign: 'top',
      y: 25,
      floating: true,
      backgroundColor: 'rgba(255,255,255,0.25)',
      symbolRadius: 0, //make column symbols square
    },
    series: [{
      name: 'Temperature',
      color: '#000000',
      //type: 'column',
      pointStart,
      pointInterval: 24 * 3600 * 1000,
      type: 'spline',
      data: data.avgt,
      zIndex: 2,
      marker: {enabled: false},
    },{
      name: 'Rainfall',
      yAxis: 1,
      color: '#F00000',
      type: 'column',
      data: data.pcpn,
      pointStart,
      pointInterval: 24 * 3600 * 1000,
      zIndex: 0,
    }, {
      name: "Cumulative Growing Degree Days",
      yAxis: 2,
      color: '#00F000',
      type: 'spline',
      data: cGdd,
      pointStart,
      pointInterval: 24 * 3600 * 1000,
      zIndex: 1,
      marker: {enabled: false}
    }]
  }
  await exportChart(options, 'RainfallTempGdd.png');
}

export async function plotSolar(data) {
  let st = moment(data.time[0]);
  let start = {
    year: st.year(),
    month: st.month(),
    day: st.day()
  }
  let pointStart = Date.UTC(start.year, start.month, start.day);

  let cGdd : any= [];
  data.gdd.forEach((val, i) => {
    cGdd[i] = i === 0 ? val : cGdd[i-1] + val;
  })
  let options = {
    chart: {
        zoomType: 'xy'
    },
    title: {
        text: 'Temperature, Solar Radiation, and GDDs',
        align: 'center'
    },
    xAxis:{
      type: 'datetime',
        maxZoom: 3 * 24 * 3600000,
         labels: {
          style: {
              color: '#000000',
                fontSize: '14px'
            }
        }
    },
    yAxis: [{ // Primary yAxis
        labels: {
            format: '{value}°F',
            style: {
                color: '#000000',
            }
        },
        title: {
            text: 'Temperature',
            style: {
                color: '#000000',
            }
        },
        opposite: true

    }, { // Secondary yAxis
        gridLineWidth: 0,
        title: {
            text: 'GHI',
            style: {
                color: '#F00000',
            }
        },
        labels: {
            format: '{value} MJ/m2',
            style: {
                color: '#F00000',
            }
        }

    }, { // Tertiary yAxis
      gridLineWidth: 0,
      title: {
        text: 'Cumulative Growing Degree Days (Base 50°F)',
        style: {
          color: '#00F000',
        }
      },
      labels: {
        format: '{value} ',
        style: {
          color: '#00F000',
        }
      },
      opposite: true
    }],
    plotOptions: {
      series: {
        marker: {
           enabled: false
        }
      }
    },
    legend: {
      layout: 'vertical',
      align: 'left',
      x: 80,
      verticalAlign: 'top',
      y: 22,
      floating: true,
      backgroundColor: 'rgba(255,255,255,0.25)'
    },
    series: [{
      name: 'Temperature',
      color: '#000000',
      //type: 'column',
      pointStart,
      pointInterval: 24 * 3600 * 1000,
      type: 'spline',
      data: data.avgt,
      tooltip: {
        valueSuffix: ' °F'
      }
    },{
      name: 'Global Horizontal Irradiance',
      yAxis: 1,
      color: '#F00000',
      //type: 'column',
      data: data.ghi,
      pointStart,
      pointInterval: 24 * 3600 * 1000,
      tooltip: {
        valueSuffix: ' in'
      }
    }, {
      name: "Cumulative Growing Degree Days",
      yAxis: 2,
      color: '#00F000',
      type: 'spline',
      data: cGdd,
      pointStart,
      pointInterval: 24 * 3600 * 1000,
    }]
  }
  await exportChart(options, 'Solar.png');
}

//Tease out Transpiration versus Evaporation
export async function plotET(data) {
  let st = moment(data.time[0]);
  let start = {
    year: st.year(),
    month: st.month(),
    day: st.day()
  }
  let pointStart = Date.UTC(start.year, start.month, start.day);

  let cGdd : any= [];
  data.gdd.forEach((val, i) => {
    cGdd[i] = i === 0 ? val : cGdd[i-1] + val;
  })
  let options = {
    chart: {
        zoomType: 'xy'
    },
    title: {
        text: 'Evapotranspiration',
        align: 'center'
    },
    xAxis:{
      type: 'datetime',
        maxZoom: 3 * 24 * 3600000,
         labels: {
          style: {
              color: '#000000',
                fontSize: '14px'
            }
        }
    },
    yAxis: [{ // Primary yAxis
        labels: {
            format: '{value}°F',
            style: {
                color: '#000000',
            }
        },
        title: {
            text: 'Temperature',
            style: {
                color: '#000000',
            }
        },
        opposite: true

    }, { // Secondary yAxis
      gridLineWidth: 0,
      title: {
        text: 'Soil Moisture (%)',
        style: {
          color: '#F00000',
        }
      },
      labels: {
        format: '{value}',
        style: {
          color: '#F00000',
        }
      }
    }, { // Tertiary yAxis
      title: {
        text: 'Evapotranspiration',
        style: {
          color: '#0000F0',
        }
      },
      labels: {
        format: '{value} in',
        style: {
          color: '#0000F0',
        }
      },
      max: 0.035,
      opposite: true,
      stackLabels: true,
      style: {
        fontWeight: 'bold',
        color: 'gray',
        textOutline: 'none'
      }
    }, {
      gridLineWidth: 0,
      title: {
        text: 'Leaf Area Index',
        style: {
          color: '#008000'
        }
      },
      labels: {
        format: '{value}',
        style: {
          color: '#008000',
        }
      }
    }],
    plotOptions: {
      series: {
        stacking: 'normal',
        marker: {
           enabled: false
        }
      }
    },
    legend: {
      layout: 'vertical',
      align: 'left',
      x: 110,
      y: 23,
      verticalAlign: 'top',
      floating: true,
      backgroundColor: 'rgba(255,255,255,0.25)',
      symbolRadius: 0, //make column symbols square
    },
    series: [{
      name: 'Temperature',
      color: '#000000',
      //type: 'column',
      pointStart,
      pointInterval: 24 * 3600 * 1000,
      type: 'spline',
      data: data.avgt,
      yAxis: 0,
      zIndex: 1,
    }, {
      name: 'Soil Moisture (Surface)',
      color: '#F00000',
      type: 'spline',
      data: data.moisture[0],
      pointStart,
      pointInterval: 24 * 3600 * 1000,
      yAxis: 1,
      zIndex: 2,
    }, {
      name: 'Evaporation',
      data: data.es,
      color: '#0000FF',
      stack: 'one',
      type: 'column',
      pointStart,
      pointInterval: 24 * 3600 * 1000,
      yAxis: 2,
      zIndex: 0,
    }, {
      name: 'Transpiration',
      data: data.ep,
      color: '#00FF00',
      stack: 'one',
      type: 'column',
      pointStart,
      pointInterval: 24 * 3600 * 1000,
      yAxis: 2,
      zIndex: 0,
    }, {
      name: 'Leaf Area Index',
      data: data.lai,
      color: '#008000',
      type: 'spline',
      pointStart,
      pointInterval: 24 * 3600 * 1000,
      zIndex: 1,
      yAxis: 3,
      marker: {enabled: false},
    }]
  }
  await exportChart(options, 'ET.png');
}

export async function rainfallGhi(data) {
  let st = moment(data.time[0]);
  let start = {
    year: st.year(),
    month: st.month(),
    day: st.day()
  }
  let pointStart = Date.UTC(start.year, start.month, start.day);

  let cGdd : any= [];
  data.gdd.forEach((val, i) => {
    cGdd[i] = i === 0 ? val : cGdd[i-1] + val;
  })
  let options = {
    chart: {
      zoomType: 'xy'
    },
    title: {
      text: 'GHI vs Rainfall',
      align: 'center'
    },
    xAxis:{
      type: 'datetime',
      maxZoom: 3 * 24 * 3600000,
      labels: {
        style: {
          color: '#000000',
            fontSize: '14px'
        }
      }
    },
    yAxis: [{ // Primary yAxis
      labels: {
        format: '{value} in',
        style: {
          color: '#000000',
        }
      },
      title: {
        text: 'Rainfall',
        style: {
          color: '#000000',
        }
      },
      opposite: true
    }, { // Secondary yAxis
      gridLineWidth: 0,
      title: {
        text: 'GHI',
        style: {
          color: '#F00000',
        }
      },
      labels: {
        format: '{value} MJ/m2',
        style: {
          color: '#F00000',
        }
      }
    }],
    legend: {
      layout: 'vertical',
      align: 'left',
      x: 80,
      verticalAlign: 'top',
      y: 22,
      floating: true,
      backgroundColor: 'rgba(255,255,255,0.25)',
      symbolRadius: 0, //make column symbols square
    },
    series: [{
      name: 'Global Horizontal Irradiance',
      yAxis: 1,
      zIndex: 1,
      color: '#F00000',
      type: 'spline',
      data: data.ghi,
      pointStart,
      pointInterval: 24 * 3600 * 1000,
      marker: {enabled: false},
    }, {
      name: 'Rainfall',
      zIndex: 0,
      color: '#000000',
      type: 'column',
      pointStart,
      pointInterval: 24 * 3600 * 1000,
      data: data.pcpn,
    }]
  }
  await exportChart(options, 'rainfallGhi.png');
}

export async function plotMoisture(data) {
  let st = moment(data.time[0]);
  let start = {
    year: st.year(),
    month: st.month(),
    day: st.day()
  }
  let pointStart = Date.UTC(start.year, start.month, start.day);

  let options = {
    /*
    chart: {
        zoomType: 'xy'
    },
   */
    title: {
        text: 'Soil Moisture vs Rainfall',
        align: 'center'
    },
    xAxis:{
      type: 'datetime',
        maxZoom: 3 * 24 * 3600000,
         labels: {
          style: {
              color: '#000000',
                fontSize: '14px'
            }
        }
    },
    yAxis: [{ // Primary yAxis
        labels: {
            format: '{value} in',
            style: {
                color: '#000000',
            }
        },
        title: {
            text: 'Rainfall',
            style: {
                color: '#000000',
            }
        },
        opposite: true
    }, { // Secondary yAxis
        gridLineWidth: 0,
        title: {
            text: 'Soil Moisture (%)',
            style: {
                color: '#F00000',
            }
        },
        labels: {
            format: '{value}', 
            style: {
                color: '#F00000',
            }
        }

    }],
    legend: {
      x: 80,
      y: 15,
      layout: 'vertical',
      align: 'left',
      verticalAlign: 'top',
      floating: true,
      backgroundColor: 'rgba(255,255,255,0.25)',
      symbolRadius: 0, //make column symbols square
    },
    series: [{
      name: 'Rainfall',
      color: '#000000',
      type: 'column',
      pointStart,
      pointInterval: 24 * 3600 * 1000,
      data: data.pcpn,
    }, {
      name: 'Soil Moisture (Surface)',
      yAxis: 1,
      color: '#FF0000',
      type: 'spline',
      data: data.moisture[0],
      pointStart,
      pointInterval: 24 * 3600 * 1000,
    }, {
      name: 'Soil Moisture (3-7.5 cm)',
      yAxis: 1,
      color: '#BF0000',
      type: 'spline',
      data: data.moisture[1],
      pointStart,
      pointInterval: 24 * 3600 * 1000,
    }, {
      name: 'Soil Moisture (7.5-15 cm)',
      yAxis: 1,
      color: '#800000',
      type: 'spline',
      data: data.moisture[2],
      pointStart,
      pointInterval: 24 * 3600 * 1000,
    }, {
      name: 'Soil Moisture (15-bot cm)',
      yAxis: 1,
      color: '#400000',
      type: 'spline',
      data: data.moisture[3],
      pointStart,
      pointInterval: 24 * 3600 * 1000,
    }]
  }
  await exportChart(options, 'Moisture.png');
}

export async function plotSurfaceMoisture(data) {
  let st = moment(data.time[0]);
  let start = {
    year: st.year(),
    month: st.month(),
    day: st.day()
  }
  let pointStart = Date.UTC(start.year, start.month, start.day);

  let options = {
    title: {
        text: 'Runoff, Infiltration, and Soil Moisture',
        align: 'center'
    },
    xAxis:{
      type: 'datetime',
        maxZoom: 3 * 24 * 3600000,
         labels: {
          style: {
              color: '#000000',
                fontSize: '14px'
            }
        }
    },
    yAxis: [{ // Primary yAxis
      title: {
        text: 'Runoff and Infiltration',
        style: {
          color: '#0000F0',
        }
      },
      labels: {
        format: '{value} in',
        style: {
          color: '#0000F0',
        }
      },
      opposite: true,
      stackLabels: true,
      style: {
        fontWeight: 'bold',
        color: 'gray',
        textOutline: 'none'
      }
    }, {
      gridLineWidth: 0,
      title: {
        text: 'Soil Moisture (%)',
        style: {
          color: '#F00000',
        }
      },
      labels: {
        format: '{value}',
        style: {
          color: '#F00000',
        }
      }
    }],
    plotOptions: {
      series: {
        stacking: 'normal'
      }
    },
    legend: {
      layout: 'vertical',
      align: 'left',
      x: 50,
      verticalAlign: 'top',
      y: 25,
      floating: true,
      backgroundColor: 'rgba(255,255,255,0.25)',
      symbolRadius: 0, //make column symbols square
    },
    series: [{
      name: 'Runoff (in)',
      data: data.runoff,
      color: '#00F000',
      stack: 'one',
      type: 'column',
      pointStart,
      pointInterval: 24 * 3600 * 1000,
      yAxis: 0
    }, {
      name: 'Infiltration (in)',
      data: data.infiltration,
      color: '#0000F0',
      stack: 'one',
      type: 'column',
      pointStart,
      pointInterval: 24 * 3600 * 1000,
      yAxis: 0
    }, {
      name: 'Soil Moisture (Surface)',
      color: '#F00000',
      data: data.moisture[0],
      type: 'spline',
      pointStart,
      pointInterval: 24 * 3600 * 1000,
      yAxis: 1,
      marker: {enabled: false},
    }]
  }
  await exportChart(options, 'RainfallMoistureRunoffInfiltration.png');
}


export async function plotThings(data) {
  exporter.initPool()
  //exporter.logLevel(4)
  try {
    await plotSolar(data)
    await precipTempGdd(data)
    await plotMoisture(data)
    await plotSurfaceMoisture(data)
    await rainfallGhi(data)
    await plotET(data)
//    await plotWaterOutputs(data);
  } catch(err) {
    exporter.killPool();
    throw err;
  }
  exporter.killPool();
}


