import './App.css'
import './CustomDialog/CustomDialog.css'
import * as turf from '@turf/turf'
import AlertBox from './AlertBox/AlertBox'
import AppConfig from './config'
import Footer from './Footer/Footer'
import Header from './Header/Header'
import L from 'leaflet'
import LeftPanel from './LeftPanel/LeftPanel'
import NBM from './NBM/NBM'
import React, {FunctionComponent, useState, useEffect} from 'react'
import Resizable from 're-resizable'
import cloneLayer from 'leaflet-clonelayer'
import nbmBioscape from './Bioscapes/biogeography.json'
import nvcsBioscape from './Bioscapes/terrestrial-ecosystems-2011.json'
import packageJson from '../package.json'
import states from './states.json'
import {isEmpty} from 'lodash'

// @Matt TODO: #next fix the fetch cors stuff
// @Matt TODO: implement eslint
export interface IBioscapeProps {
  biogeography: any
  'nbm-react': any
  'terrestrial-ecosystems-2011': any
}

export interface IFeature {
  properties: {
    feature_id: string
    userDefined: boolean
  }
  geometry: boolean
}

const ELEVATION_SOURCE = 'https://nationalmap.gov/epqs/pqs.php?'
const GET_FEATURE_API = AppConfig.REACT_APP_BIS_API + '/api/v1/places/search/feature?feature_id='
const NVCS_FEATURE_LOOKUP = ['Landscape Conservation Cooperatives', 'US County', 'Ecoregion III', 'US States and Territories']
const POINT_SEARCH_API = AppConfig.REACT_APP_BIS_API + '/api/v1/places/search/point?'
const REACT_VERSION = 'v' + packageJson.version
const TEXT_SEARCH_API = AppConfig.REACT_APP_BIS_API + '/api/v1/places/search/text?q='

const bioscapeMap: IBioscapeProps = {
  'biogeography': nbmBioscape,
  'nbm-react': nbmBioscape,
  'terrestrial-ecosystems-2011': nvcsBioscape
}

const numberWithCommas = (x: number) => {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const App: FunctionComponent<{ bioscape: keyof IBioscapeProps }> = ({ bioscape }) => {

  let initState: any = null
  let shareStateBeforeHash: any = null

  // @Matt TODO: do something with the errorState
  const [errorState, setErrorState] = useState(null)
  useEffect(() => {
    console.log(errorState)
  }, [errorState])

  const [state, setState] = useState(() => {

    const s = {
      bioscape: bioscapeMap[bioscape],
      bioscapeName: bioscape,
      results: [],
      feature: {} as IFeature,
      rangeYearMin: 2000,
      mapDisplayYear: 2005,
      rangeYearMax: 2010,
      map: null as any,
      analysisLayers: [] as any[],
      priorityBap: null,
      clickDrivenEvent: false,
      basemap: '',
      lat: 0,
      lng: 0,
      elv: 0,
      overlay: null as any,
      mapClicked: null as any,
    }

    // @Matt TODO: this would probably be better as a hook
    let loc = window.location.href
    let split = loc.split('#')

    if (split.length === 2 && split[1]) {
      initState = JSON.parse(atob(split[1]))
      s.basemap = initState.basemap
      s.rangeYearMin = initState.timeSlider.rangeYearMin
      s.rangeYearMax = initState.timeSlider.rangeYearMax
      s.mapDisplayYear = initState.timeSlider.mapDisplayYear
      s.priorityBap = initState.priorityBap
      s.lat = initState.point.lat
      s.lng = initState.point.lng
      s.elv = initState.point.elv
      s.clickDrivenEvent = initState.point.lat ? true : false
    }

    return s
  })

  const parseBioscape = () => {

    let basemap = state.basemap ? state.basemap : state.bioscape.basemaps.find((obj: any) => {
      return obj.selected === true
    })

    let overlay: any = null
    if (state.bioscape.overlays) {
      for (let i = 0; i < state.bioscape.overlays.length; i++) {
        let overlay = state.bioscape.overlays[i]
        overlay['layer'] = L.tileLayer.wms(
          state.bioscape.overlays[i]['serviceUrl'],
          state.bioscape.overlays[i]['leafletProperties']
        )
      }

      overlay = state.bioscape.overlays.find((obj: any) => obj.selected === true)
    }

    setState((prev) => Object.assign({}, prev, {
      basemap: basemap,
      overlay: overlay,
    }))

  }

  // @Matt TODO: check if we had componentWillUnmount
  // @Matt TODO: this needs to be checked and refactored
  useEffect(() => {
    console.log('bioscape effect')

    parseBioscape()
    document.title = state.bioscape.title

    if (!isEmpty(state.feature)) {
      getHash()
    }
  // @Matt TODO: need a better fix then ignore
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.bioscape.title, state.feature])

  useEffect(() => {
    console.log('polygon effect')

    if (initState?.userDefined) {
      handelDrawnPolygon(initState.userDefined.geom, true)
    } else if (initState) {
      submitHandler(initState.feature, true)
    }
  })

  const getHash = () => {
    shareStateBeforeHash = {
      feature: {feature_id: state.feature.properties.feature_id},
      basemap: state.basemap,
      timeSlider: {rangeYearMin: state.rangeYearMin, rangeYearMax: state.rangeYearMax, mapDisplayYear: state.mapDisplayYear},
      priorityBap: state.priorityBap,
      baps: shareStateBeforeHash ? shareStateBeforeHash.baps : initState ? initState.baps : {},
      point: {lat: state.lat, lng: state.lng, elv: state.elv}
    }
    if (state.feature.properties.userDefined) {
      shareStateBeforeHash.userDefined = {geom: state.feature.geometry}
    }
    window.location.hash = Buffer.from(JSON.stringify(shareStateBeforeHash)).toString('base64')
  }

  // @Matt TODO: double check this
  const shareState = () => {
    if (state.feature) {
      let copyText = document.getElementsByClassName('share-url-input')[0] as HTMLInputElement
      copyText.style.display = 'inline-block'
      // @Matt TODO: this used to be just 'location'
      copyText.value = window.location.href
      copyText.select()
      document.execCommand('copy')
      copyText.style.display = 'none'
      return copyText.value
    }
    return window.location.href
  }

  const setBapState = (bapId: string, bapState: any) => {
    if (shareStateBeforeHash && shareStateBeforeHash.baps) {
      shareStateBeforeHash.baps[bapId] = bapState
      if (!isEmpty(state.feature)) {
        getHash()
      }
    }
  }

  const basemapChanged = (e: any) => {
    setState((prev) => Object.assign({}, prev, {basemap: e }))
  }

  /* const overlayChanged = (e: any) => { */
  /*   setState((prev) => Object.assign({}, prev, { overlay: e })) */

  /*   if (state.lat && state.lng) { */
  /*     handleMapClick({ */
  /*       latlng: { */
  /*         lat: state.lat, */
  /*         lng: state.lng */
  /*       } */
  /*     }, false) */
  /*   } */
  /* } */

  const setMap = (map: any) => {
    map.current.leafletElement.createPane('summarizationPane')
    map.current.leafletElement.getPane('summarizationPane').style.zIndex = 402
    map.current.leafletElement.getPane('overlayPane').style.zIndex = 403

    setState((prev) => Object.assign({}, prev, { map: map }))
  }

  const handelDrawnPolygon = (geom: any, init: any) => {
    if (geom) {
      setState((prev) => Object.assign({}, prev, {
        feature: {
          geometry: geom,
          properties: {
            approxArea: getApproxArea(geom),
            userDefined: true,
            feature_class: 'Polygon',
            gid: null,
            feature_name: 'User Defined Polygon',
            feature_code: null,
            feature_id: Math.random().toString(36).substring(7),
            feature_description: 'User Defined Polygon',
          },
          type: 'Feature'
        }
      }))

      if (!init) {
        setState((prev) => Object.assign({}, prev, {
          priorityBap: null,
          analysisLayers: [],
        }))
      }
    } else {
      setState((prev) => Object.assign({}, prev, { feature: null }))
    }
  }

  // turns geometries into line collections
  // draws lines that cross the 180 on both sides of the map
  // ex 'Alaska' or 'Aleutian and Bering Sea Islands'
  const parseGeom = (geometry: any) => {

    let edgeOfMap = 10
    let leftEdge = false // close to left edge
    let polyLineCollection: any[] = []
    let polyLineCollectionOtherWorld: any[] = []
    let rightEdge = false // close to right edge

    // convert
    geometry.coordinates.forEach((feature: any) => {
      feature.forEach((polygon: any) => {
        let lineCoord = {
          'type': 'LineString',
          'coordinates': [] as any[],
        }

        let lineCoordCopy = {
          'type': 'LineString',
          'coordinates': [] as any[]
        }

        let crossed22 = false

        for (let i = 0; i < polygon.length; i++) {
          let coordinates = polygon[i]
          if ((coordinates[0] < -179.99 || coordinates[0] > 179.99) && lineCoord.coordinates.length) {
            if (lineCoord.coordinates.length > 1) {
              polyLineCollection.push(lineCoord)
              if (crossed22) {
                lineCoordCopy = {
                  'type': 'LineString',
                  'coordinates': []
                }
                // eslint-disable-next-line
                lineCoord.coordinates.forEach((coordinates) => {
                  lineCoordCopy.coordinates.push([coordinates[0] - 360, coordinates[1]])
                })

                polyLineCollectionOtherWorld.push(lineCoordCopy)
              }
            }
            lineCoord = {
              'type': 'LineString',
              'coordinates': []
            }
          }
          if (coordinates[0] > -179.99 && coordinates[0] < 179.99) {
            lineCoord.coordinates.push(coordinates)
            if (coordinates[0] > 22.5) crossed22 = true
            if (coordinates[0] > 180 - edgeOfMap) rightEdge = true
            if (coordinates[0] < -180 + edgeOfMap) leftEdge = true
          }
          else {
            if (i + 1 < polygon.length && polygon[i + 1][0] > -179.99 && polygon[i + 1][0] < 179.99) {
              lineCoord.coordinates.push(coordinates)
            }
          }

        }

        polyLineCollection.push(lineCoord)
        if (crossed22) {
          lineCoordCopy = {
            'type': 'LineString',
            'coordinates': []
          }
          lineCoord.coordinates.forEach(coordinates => {
            lineCoordCopy.coordinates.push([coordinates[0] - 360, coordinates[1]])
          })
          polyLineCollectionOtherWorld.push(lineCoordCopy)
        }
      })
    })

    if (rightEdge && leftEdge) { // if its close to both edges draw on both sides of map
      polyLineCollectionOtherWorld.forEach(line => {
        polyLineCollection.push(line)
      })
    }
    let lines = polyLineCollection.map((p) => {
      return p.coordinates
    })
    let result = {
      type: 'MultiLineString',
      coordinates: lines
    }
    return result
  }

  const getApproxArea = (geom: any) => {
    let approxArea = 'Unknown'
    try {
      let area = 0
      if (geom.type === 'MultiPolygon') {
        for (let poly of geom.coordinates) {
          area += turf.area(turf.polygon(poly))
        }
      }
      else {
        area = turf.area(turf.polygon(geom.coordinates))
      }
      // @ts-ignore
      approxArea = numberWithCommas(turf.convertArea(area, 'meters', 'acres'))
    }
    catch (e) {
      console.log(e)
    }
    return approxArea
  }

  const submitHandler = (feature: any, init: boolean) => {
    if (!feature.feature_id) return
    fetch(GET_FEATURE_API + feature.feature_id)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.hits.hits.length && data.hits.hits[0]['_source']) {
          let result = data.hits.hits[0]['_source']
          result.properties.approxArea = getApproxArea(result.geometry)
          result.geometry = parseGeom(result.geometry)
          result.properties = countyStateLookup([result.properties])[0]
          try {
            // Need this to validate result
            L.geoJSON(result)
            setState((prev) => Object.assign({}, prev, {
              feature: result,
              mapClicked: false
            }))
          } catch(err) {
            setErrorState(err)
          }
        }
        else {
          setState((prev) => Object.assign({}, prev, {
            feature: null,
            mapClicked: false
          }))
        }
        if (!init) {
          setState((prev) => Object.assign({}, prev, {
            priorityBap: null,
            analysisLayers: []
          }))
        }
      })
      .catch(setErrorState)
  }

  const sendFeatureRequestFromOverlay = (results: any) => {
    let overlay = state.overlay
    if (!overlay) { return }

    for (let i = 0; i < results.length; i++) {
      let feature = results[i]
      if (feature['feature_class'] === overlay.featureClass) {
        i = results.length
        submitHandler({
          feature_id: feature.feature_id
        }, false)
      }
    }
  }

  const handleMapClick = (e: any, ignore: boolean) => {
    getElevationFromPoint(e.latlng.lat, e.latlng.lng)
    fetch(POINT_SEARCH_API + `lat=${e.latlng.lat}&lng=${e.latlng.lng}`)
      .then(res => res.json())
      .then((result) => {
        if (!result || !result.hits) { return }

        if (state.overlay) {
          sendFeatureRequestFromOverlay(result.hits.hits.map((a: any) => a['_source']['properties']))
          setState((prev) => Object.assign({}, prev, {
            lat: e.latlng.lat,
            lng: e.latlng.lng,
            clickDrivenEvent: true
          }))
        }

        else if (state.bioscape.overlays) {
          let r = result.hits.hits.map((a: any) => a['_source']['properties'])

          r = countyStateLookup(r)
          r = r.filter((a: any) => {
            return NVCS_FEATURE_LOOKUP.includes(a.feature_class)
          })

          setState((prev) => Object.assign({}, prev, {
            lat: e.latlng.lat,
            lng: e.latlng.lng,
            results: r,
            mapClicked: !ignore,
            clickDrivenEvent: true
          }))
        } else {
          let r = result.hits.hits.map((a: any) => a['_source']['properties'])
          r = countyStateLookup(r)
          setState((prev) => Object.assign({}, prev, {
            lat: e.latlng.lat,
            lng: e.latlng.lng,
            results: r,
            mapClicked: !ignore,
            clickDrivenEvent: true
          }))
        }
      })
      .catch(setErrorState)
  }

  // given a list of results look up the state if applicable
  const countyStateLookup = (rlist: any) => {
    return rlist.map((a: any) => {
      if (a.feature_class === 'US County') {
        let stateFips = a.feature_id.substring(15, 17)
        let state = states.find(s => {
          return s.fips === stateFips
        })
        a.state = state
      }
      return a
    })
  }

  const getElevationFromPoint = (lat: any, lng: any) => {

    fetch(`${ELEVATION_SOURCE}x=${lng}&y=${lat}&units=Feet&output=json`)
      .then(res => res.json())
      .then((result) => {
        let identifiedElevationValue = result.USGS_Elevation_Point_Query_Service
        let elev = identifiedElevationValue.Elevation_Query.Elevation
        elev = elev > -400 ? numberWithCommas(parseInt(elev)) : 'No Data'
        setState((prev) => Object.assign({}, prev, { elv: elev }))
      })
      .catch(setErrorState)
  }

  // @Matt TODO: need to debounce this, too many fetches
  // @Matt TODO: refactor to leftpanel
  const handleSearchBox = (text: any) => {

    if (text.length < 5) {
      setState((prev) => Object.assign({}, prev, {
        results: []
      }))

      return
    }

    fetch(TEXT_SEARCH_API + text)
      .then(res => res.json())
      .then((result) => {
        let r = result.hits.hits.map((a: any) => a['_source']['properties'])

        r = countyStateLookup(r)

        if (state.bioscape.overlays) {
          r = r.filter((a: any) => {
            return NVCS_FEATURE_LOOKUP.includes(a.feature_class)
          })
        }

        setState((prev) => Object.assign({}, prev, {
          results: r,
          clickDrivenEvent: false
        }))

      })
      .catch(setErrorState)

  }

  const setYearRange = (years: any) => {
    setState((prev) => Object.assign({}, prev, {
      rangeYearMin: years[0],
      rangeYearMax: years[1]
    }))
  }

  const setMapDisplayYear = (year: any) => {
    setState((prev) => Object.assign({}, prev, {
      mapDisplayYear: year
    }))

    if (state.analysisLayers.length !== 0) {
      state.analysisLayers.forEach((item: any) => {
        if (item.timeEnabled) {
          item.layer.setParams(
            {
              time: `${year}-01-01`
            }
          )
        }
      })
    }
  }

  // changes the map display year.
  // unfortunate that we need to use timeouts to acount for rendering time
  // for a smooth transition. on 'load' is network only, not time it takes to paint
  const setMapDisplayYearFade = (year: any) => {
    setState((prev) => Object.assign({}, prev, {
      mapDisplayYear: year
    }))

    if (state.analysisLayers) {
      state.analysisLayers.forEach((item) => {
        if (item.timeEnabled) {
          let currentOpacity = Number(item.layer.options.opacity).toFixed(2)
          let clone = cloneLayer(item.layer)
          clone.setParams({time: item.layer.wmsParams.time})
          clone.setOpacity(0)
          clone.addTo(state.map.current.leafletElement)
          // weird case where layer 'load' doesent fire and clone doesnt get removed.
          setTimeout(() => {state.map.current.leafletElement.removeLayer(clone)}, 5000)

          clone.on('load', () => {
            setTimeout(() => {
              clone.setOpacity(currentOpacity)
              item.layer.setOpacity(0)
              item.layer.setParams({time: `${year}-01-01`})
            }, 150)
            clone.off('load')
          })

          item.layer.on('load', () => {
            setTimeout(() => {
              layerTransitionFade(item.layer, clone, currentOpacity)
            }, 250)
            item.layer.off('load')
          })
        }
      })
    }
  }

  // brings layer 1 up and layer 2 down; removes layer 2.
  const layerTransitionFade = (layer: any, layer2: any, targetOpacity: any) => {
    let currentOpacityLayer = Math.round((layer.options.opacity + Number.EPSILON) * 100) / 100
    let currentOpacitylayer2 = Math.round((layer2.options.opacity + Number.EPSILON) * 100) / 100
    let recurse = false

    if (currentOpacitylayer2 > .11) {
      layer2.setOpacity(currentOpacitylayer2 - 0.10)
      recurse = true
    }

    if (currentOpacityLayer < targetOpacity) {
      layer.setOpacity(currentOpacityLayer + 0.10)
      recurse = true
    }

    if (recurse) {
      setTimeout(() => {layerTransitionFade(layer, layer2, targetOpacity)}, 100)
    }

    // Idealy we would only remove clone here but about 5% of the time layer 'load' doesnt fire
    // see comment in setMapDisplayYear above
    else {
      state.map.current.leafletElement.removeLayer(layer2)
    }

    // This shouldn't happen, but does when cycling the map. this is crude, but
    //   prevents the map from going blank if going thru a long progression
    if ((currentOpacityLayer < .11)) {
      //         console.log('Failsafe setting opacity to .5 currentOpacityLayer '+ currentOpacityLayer + ' targetOpacity= '+targetOpacity);
      layer.setOpacity(.50)
    }
  }

  const updateAnalysisLayers = (layers: any) => {
    setState((prev) => Object.assign({}, prev, { analysisLayers: layers, }))
  }

  const setPriorityBap = (bapId: any) => {
    setState((prev) => Object.assign({}, prev, { priorityBap: bapId }))
  }

  // @Matt TODO: need to use contexts to pass props down?
  return (
    <div className="vwrapper">
      <Header title={state.bioscape.title} description={state.bioscape.description} />
      <AlertBox />
      <div id="content-area">
        <Resizable
          className="panel-area"
          enable={{top: false, right: true, bottom: false, left: false, topRight: false, bottomRight: false, bottomLeft: false, topLeft: false}}
          defaultSize={{width: 540}}
          minWidth={250}
          maxWidth={1000}
          onResizeStop={() => {
            state.map.current.leafletElement.invalidateSize(); setMapDisplayYear(state.mapDisplayYear + 1); setMapDisplayYear(state.mapDisplayYear - 1)
          }}
        >
          <LeftPanel
            basemapChanged={basemapChanged}
            bioscape={state.bioscape}
            results={state.results}
            textSearchHandler={handleSearchBox}
            submitHandler={submitHandler}
            feature={state.feature}
            mapClicked={state.mapClicked}
            rangeYearMin={state.rangeYearMin}
            rangeYearMax={state.rangeYearMax}
            updateAnalysisLayers={updateAnalysisLayers}
            setPriorityBap={setPriorityBap}
            shareState={shareState}
            setBapState={setBapState}
            map={state.map}
            initBaps={(initState || {}).baps}
            priorityBap={state.priorityBap}
            bioscapeName={state.bioscapeName}
            point={{lat: state.lat, lng: state.lng, elv: state.elv}}
            overlay={state.overlay}
          />
        </Resizable>

        <div id="map-area">
          <NBM
            className="relative-map"
            basemap={state.basemap}
            overlay={state.overlay}
            feature={state.feature}
            parentClickHandler={handleMapClick}
            parentDrawHandler={handelDrawnPolygon}
            setYearRange={setYearRange}
            setMapDisplayYear={setMapDisplayYear}
            setMapDisplayYearFade={setMapDisplayYearFade}
            analysisLayers={state.analysisLayers}
            setMap={setMap}
            rangeYearMax={state.rangeYearMax}
            rangeYearMin={state.rangeYearMin}
            mapDisplayYear={state.mapDisplayYear}
            bioscapeName={state.bioscapeName}
            applicationVersion={REACT_VERSION}
            priorityBap={state.priorityBap}
            clickDrivenEvent={state.clickDrivenEvent}
            initPoint={(initState || {}).point}
          />
        </div>
      </div>
      <Footer />
    </div>
  )
}

export default App