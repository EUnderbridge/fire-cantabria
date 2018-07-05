// Funciones de ayuda para transformacion de datos del chart
  // Óbtener los datos [clave, valor]
function generateSioseTuplesForGeoJsonFeature(geoJsonFeature) {
  return sioseKeysList.map(function(sioseKey) {
    var sioseValue = geoJsonFeature.properties[sioseKey];
    return [sioseKey, sioseValue];
  });
}
  // Agregar los valores de superficie de cada uso del suelo
function generateSioseTuplesForGeoJson(geoJson) {
  var tuplesByFeature = geoJson.features.map(generateSioseTuplesForGeoJsonFeature);
  var reusult = tuplesByFeature.pop();
  return tuplesByFeature.reduce(function(aggregatedTuples, featureTuples) {
    return aggregatedTuples.map(function(e, idx) {
      var sioseKey = e[0];
      var sioseAggregatedValue = e[1];
      return [sioseKey, sioseAggregatedValue + featureTuples[idx][1]];
    });
  }, tuplesByFeature.pop());
}
  // Disponer los datos de acuerdo al Chart
function generateChartConfigForSioseTuples(sioseTuples) {
  // Agregar aquellos usos que no suepren un umbral de superficie en "Otros"
  // Encontramos el valor maximo
  var maxValue = sioseTuples.reduce(function(potentialMax, siose_tuple) {
    return Math.max(potentialMax, siose_tuple[1]);
  }, 0);

  // Agrupamos las tuplas con valor inferior al umbral bajo una tupla virtual "Others"
  var dataset = sioseTuples.reduce(function(dataset_curated, siose_tuple) {
    var siose_value = siose_tuple[1];
    if (siose_value < (maxValue * 0.00)) {
      dataset_curated[0][1] += siose_value;
    } else {
      dataset_curated.push(siose_tuple);
    }
    return dataset_curated;
  }, [ [ 'Others', 0 ] ]);

  // Ordenamos los datos de mayor a menor
  dataset.sort(function(a, b) {
    var valueA = a[1];
    var valueB = b[1];
    var labelA = a[0];
    var labelB = b[0];
    if (labelA === "Others") {
      return 1;
    } else if (labelB === "Others") {
      return -1;
    } else {
      return valueA < valueB;
    }
  });

  // Adaptamos los datos para usarlos en el pie chart
  var datasetData = dataset.map(function(dataset_tuple) {
    return dataset_tuple[1];
  });

  var dataLabels = dataset.map(function(dataset_tuple) {
    var dataLabelNameShort = dataset_tuple[0];
    return clcTranslations[dataLabelNameShort] || "ERROR!";
  });

  var dataColors = dataset.map(function(dataset_tuple) {
    var dataLabelNameShort = dataset_tuple[0];
    return clcColors[dataLabelNameShort] || "red";
  })

  return {
    datasets: [{
      data: datasetData,
      backgroundColor: dataColors,
    }],
    labels: dataLabels,
  };
}
  // Obtener las etiquetas válidas
function normalizeSoilUses(feature) {
  Object.keys(feature.properties).forEach(function(propertyName) {
    var match = /^SUM_([A-Za-z]+)/.exec(propertyName);
    if (match) {
      var nicePropertyName = match[1];
      feature.properties[nicePropertyName] = feature.properties[propertyName]
    }
  });
  sioseKeysList.forEach(function(sioseKey) {
    if (!feature.properties[sioseKey]) {
      feature.properties[sioseKey] = 0;
    }
  })
  return feature;
}
  // Generar información del Chart por polígono
function addBurnFeatureMouseListeners(feature, layer) {
  layer.on("click", function() {
    var geoJsonFeature = normalizeSoilUses(feature);
    var sioseTuples = generateSioseTuplesForGeoJsonFeature(geoJsonFeature);
    var data = generateChartConfigForSioseTuples(sioseTuples);
    Object.assign(pieChart.data, data);
    var areaSum = sioseTuples.reduce(function(sum, tuple) {
      return sum + tuple[1];
    }, 0);
    pieChart.update();
    document.querySelector('.piechart-control').classList.toggle('visible', true);
    document.querySelector('.area').innerHTML = areaSum.toFixed(2);
  })
  layer.on("click", function() {
    var year = feature.properties.year || "0000"
    document.querySelector('.year').innerHTML = year;
  })
}

// Función de iluminación de polígonos
function addMouseListenerToFeature(feature, layer) {
  layer.on({
    mouseover: function highlightPolygon(e) {
      e.target.setStyle({
        weight: 3,
        fillOpacity: 0.4,
      });
    },
    mouseout: function revertHighlightPolygon(e) {
      e.target.setStyle({
        weight: 2,
        fillOpacity: 0,
      });
    },
    click: function zoomToPolygon(ev) {
      ev.target._map.fitBounds(ev.target.getBounds());
    }
  });
}

// Funciones de inicializacion del mapa
  // Mapa base de OSM
function setupMapboxLayer() {
  var mapboxUrl = 'https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw';
  var mapbox = L.tileLayer(mapboxUrl, {
    id: 'mapbox.streets',
    attribution: [
      'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors',
      '<a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>',
      'Imagery © <a href="http://mapbox.com">Mapbox</a>',
    ].join(', '),
  });
  return mapbox;
}
  // Minimapa
function setupOsmMinimapLayer() {
  var osmUrl='http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  var osmAttrib='Map data &copy; OpenStreetMap contributors.';
  var osm2 = new L.TileLayer(osmUrl, {minZoom: 0, maxZoom: 13, attribution: osmAttrib });
  var miniMap = new L.Control.MiniMap(osm2, { toggleDisplay: true, position: 'bottomright' });
  return miniMap;
}

  // Control de capas
function setupControlLayer(osm) {
  var baseLayers = {
    "Open Street Map": osm,
    "Foto aérea": Spain_PNOA_Ortoimagen,
  };
  var burntLayerStyle = function(fillColor, color) {
    return Object.assign({
      fillColor: fillColor,
      weight: 2,
      opacity: 0.5,
      color: color,
      fillOpacity: 0,
    })
  }
  var overlayLayers = {
    "Municipios": L.geoJson(municipios, {
      style: {
        fillColor: '#ffffe6',
        weight: 1.5,
        opacity: 0.25,
        color: '#1a1a1a',
        fillOpacity: 00
      },
      onEachFeature: addMouseListenerToFeature,
    }).bindTooltip(function(ev) {
      return ev.feature.properties.Texto;
    }, { sticky: true }),

    "Incendios 2009": L.geoJson(siose09, {
      style: burntLayerStyle('#ff8080', '#ff0000'),
      onEachFeature: function(feature, layer) {
        addMouseListenerToFeature(feature, layer);
        addBurnFeatureMouseListeners(feature, layer);
      },
    }),
    "Incendios 2010": L.geoJson(siose10, {
      style: burntLayerStyle('#6600ff', '#6600ff'),
      onEachFeature: function(feature, layer) {
        addMouseListenerToFeature(feature, layer);
        addBurnFeatureMouseListeners(feature, layer);
      },
    }),
    "Incendios 2011": L.geoJson(siose11, {
      style: burntLayerStyle('#00804d', '#00804d'),
      onEachFeature: function(feature, layer) {
        addMouseListenerToFeature(feature, layer);
        addBurnFeatureMouseListeners(feature, layer);
      },
    }),
    "Incendios 2012": L.geoJson(siose12, {
      style: burntLayerStyle('#996633', '#996633'),
      onEachFeature: function(feature, layer) {
        addMouseListenerToFeature(feature, layer);
        addBurnFeatureMouseListeners(feature, layer);
      },
    }),
    "Incendios 2013": L.geoJson(siose13, {
      style: burntLayerStyle(' #ff66cc', ' #ff66cc'),
      onEachFeature: function(feature, layer) {
        addMouseListenerToFeature(feature, layer);
        addBurnFeatureMouseListeners(feature, layer);
      },
    }),
    "Incendios 2014": L.geoJson(siose14, {
      style: burntLayerStyle('#660066', '#660066'),
      onEachFeature: function(feature, layer) {
        addMouseListenerToFeature(feature, layer);
        addBurnFeatureMouseListeners(feature, layer);
      },
    }),
  };
  return L.control.layers(baseLayers, overlayLayers, {collapsed:true});
}

// Función de eventos de interacción con el usuario
function setupEventListeners(map, pieChart) {
  map.addEventListener('overlayadd', function updateChartData(ev) {
    if (ev.name === "Municipios") {
      ev.layer.bringToBack();
    }
  });
  // Actualizamos los datos de la grafica cada vez que se cambia de capa
  map.addEventListener('overlayadd', function updateChartData(ev) {
    var geoJson = geoJsonsByName[ev.name];
    var data = generateChartConfigForSioseTuples(generateSioseTuplesForGeoJson(geoJson));
    Object.assign(pieChart.data, data);
    pieChart.update();
  });
  // Actualizamos los enlaces de Mas...
  map.addEventListener('overlayadd', function updateChartData(ev) {
    var title = ev.name;
    // Ocultamos todos
    document.querySelectorAll(".piechart-container a").forEach(function(e) {
      e.classList.add("hidden");
    });
    document.querySelector('a[title="$0"]'.replace('$0', title)).classList.remove("hidden");
  });
  // Mostrar/Ocultar la grafica al hacer click en el icono
  document.querySelector('.piechart-handle').addEventListener('click', function(ev) {
    document.querySelector('.piechart-control').classList.toggle('visible');
  });
}

// Función de puesta a punto
function setupApp() {
  // Visualizacion del mapa
  var map = L.map('map', {
    zoomControl: false,
    maxZoom: 18,
    minZoom: 9,
    maxBounds: [
      [42.5, -5.011481], // SO
      [43.719965, -2.686499], // NE
    ],
  });

  // Visualización del Chart
  var pieChart = new Chart(document.querySelector("#piechart"),{
    type: 'pie',
    data: [],
    // data: generateChartConfigForSioseTuples(generateSioseTuplesForGeoJsonFeature(siose09.features[0])),
    options: {
      legend: {
        display: false,
      },
      title: {
        display: false,
      },
      tooltips: {
        callbacks: {
          label: function(tooltipItem, data) {
            var label = data.labels[tooltipItem.index];
            return label;
          },
          afterLabel: function(tooltipItem, data) {
            var value = data.datasets[tooltipItem.datasetIndex].data[tooltipItem.index];
            var total = data.datasets[tooltipItem.datasetIndex].data.reduce(function(a,b) {
              return a + b;
            }, 0);
            var percent = value/total * 100;
            return [ value.toFixed(2) + "Ha", percent.toFixed(2) + "%" ];
          }
        }
      }
    },
  });
  // Visualización mapa base
  var mapboxLayer = setupMapboxLayer();
  // Visualización Minimap
  var osmMiniMap = setupOsmMinimapLayer();
  //Visualización control de capas
  var controlLayer = setupControlLayer(mapboxLayer);

  window.pieChart = pieChart;
  map.setView([43.087532, -4.082921], 9.5);
  mapboxLayer.addTo(map);
  osmMiniMap.addTo(map);
  controlLayer.addTo(map);
  setupEventListeners(map, pieChart);
  map.addControl(new L.Control.Fullscreen());
}

// Iniciar
window.addEventListener('load', setupApp);
window.addEventListener('load', function() {
  window.removeEventListener('load', setupApp);
});
