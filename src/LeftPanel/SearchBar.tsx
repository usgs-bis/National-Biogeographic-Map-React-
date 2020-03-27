import './SearchBar.scss'
import AppConfig from '../config'
import BasemapContext from '../Contexts/BasemapContext'
import ClickDrivenContext from '../Contexts/ClickDrivenContext'
import React, { FunctionComponent, useState, useEffect, useContext, useRef, Dispatch, SetStateAction } from 'react'
import ResultsContext from '../Contexts/ResultsContext'
import _ from 'lodash'
import speechBubble from './bubble.png'
import {Button, ButtonGroup, UncontrolledTooltip} from 'reactstrap'
import {Collapse, CardBody, Card} from 'reactstrap'
import {IoMdSettings, IoMdRefresh} from 'react-icons/io'
import {NVCS_FEATURE_LOOKUP} from '../App'
import {RadioGroup} from '../CustomRadio/CustomRadio'
import {countyStateLookup} from '../Utils/Utils'
import {isEmpty} from 'lodash'

const TEXT_SEARCH_API = AppConfig.REACT_APP_BIS_API + '/api/v1/places/search/text?q='

export interface ISearchBarProps {
  setErrorState: Dispatch<SetStateAction<Error | undefined>>
  initBaps: any[]
  point: {
    lat: number
    lng: number
  }
  mapClicked: boolean
  submitHandler: Function
  bioscape: any
}

const SearchBar: FunctionComponent<ISearchBarProps> = (props) => {
  const { initBaps, point, mapClicked, submitHandler, bioscape, setErrorState } = props

  const [basemap, setBasemap] = useContext(BasemapContext)
  const {isClickDriven} = useContext(ClickDrivenContext)

  const [basemapOptions] = useState(() => {
    if (!isEmpty(basemap)) {
      return bioscape.basemaps.map((p: any) => {
        p.selected = (basemap?.serviceUrl === p.serviceUrl)
        return p
      })
    } else {
      return bioscape.basemaps
    }
  })

  const [displayHelpPopup, setDisplayHelpPopup] = useState(isEmpty(initBaps))
  const [focused, setFocused] = useState(false)
  const [layersDropdownOpen, setLayersDropdownOpen] = useState(false)
  const [searchWatermark, setSearchWatermark] = useState('Search for a place of interest or click on the map')

  const {results, setResults} = useContext(ResultsContext)

  const textInput = useRef<null|HTMLInputElement>(null)

  const hideHelpPopup = () => setDisplayHelpPopup(false)

  useEffect(() => {
    if (displayHelpPopup) {
      document.body.addEventListener('click', hideHelpPopup, true)
      document.body.addEventListener('keydown', hideHelpPopup, true)

      return () => {
        document.body.removeEventListener('click', () => hideHelpPopup, true)
        document.body.removeEventListener('keydown', () => hideHelpPopup, true)
      }
    }
  }, [displayHelpPopup])

  useEffect(() => {
    if (mapClicked) {
      textInput?.current?.focus()
      setFocused(true)
      setSearchWatermark(`Lat: ${point.lat.toFixed(5)}, Lng: ${point.lng.toFixed(5)}`)
    }
  }, [mapClicked, point.lat, point.lng, textInput])

  const handleSearchBox = _.debounce((text: any) => {

    if (text.length < 5) {
      setResults([])

      return
    }

    fetch(TEXT_SEARCH_API + text)
      .then(res => res.json())
      .then((result) => {
        let r = result.hits.hits.map((a: any) => a['_source']['properties'])

        r = countyStateLookup(r)

        if (bioscape.overlays) {
          r = r.filter((a: any) => {
            return NVCS_FEATURE_LOOKUP.includes(a.feature_class)
          })
        }

        setResults(r)
        isClickDriven(false)
      })
      .catch(setErrorState)

  }, 250)

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    handleSearchBox(e.currentTarget.value)
  }

  const onFocus = () => {
    setFocused(true)
  }

  const onBlur = () => {
    setTimeout(() => {
      setFocused(false)
      if (textInput?.current) {
        textInput.current.value = ''
      }
    }, 150)
  }

  const toggleBasemapDropdown = () => {
    setLayersDropdownOpen(!layersDropdownOpen)
  }

  const basemapChanged = (e: any) => {
    // Fixes bug in FF where search bar gains focus
    setFocused(false)
    setBasemap(e)
  }

  const reset = () => {
    window.location.hash = ''
    window.location.reload()
  }

  return (
    <div>
      <div className="nbm-flex-row">
        <div className="settings-btn-group nbm-flex-column">
          <Button id="settings-tooltip" onClick={toggleBasemapDropdown} className="submit-analysis-btn icon-btn" >
            <IoMdSettings />
          </Button>
          <UncontrolledTooltip target="settings-tooltip" >Settings</UncontrolledTooltip>
        </div>
        <div className="settings-btn-group nbm-flex-column">
          <Button id="reset-tooltip" className="submit-analysis-btn icon-btn" onClick={reset} >
            <IoMdRefresh />
          </Button>
          <UncontrolledTooltip target="reset-tooltip" >Reset Map</UncontrolledTooltip>
        </div>
        <div className="nbm-flex-column-big">
          <input
            ref={textInput}
            onClick={onFocus}
            onBlur={onBlur}
            onKeyUp={handleKeyUp}
            className="input-box px-2"
            placeholder={searchWatermark}
            type="text"
          />
        </div>
      </div>
      <div className="nbm-flex-row" >
        {(results.length === 0) && (point.lng || textInput.current?.value) && focused &&
          <>
          <div className="section-title">No locations found for analysis</div>
          { textInput.current?.value &&
            <div className="no-results-tip">Search for places including National Parks, Ecoregions, Landscape Conservation Cooperatives, Marine Protected Areas, States, Counties, National Forest and more.</div>
          }
          </>
        }
        {(results.length > 0) && focused &&
          <>
            <div className="section-title">Locations available for analysis</div>
            <div className="button-group">
              <ButtonGroup vertical>
                {results.map((d: any) => (
                  <Button
                    className="sfr-button"
                    style={{whiteSpace: 'normal'}}
                    onClick={() => {submitHandler(d)}}
                    id={d.feature_id}
                    key={d.feature_id}>
                    {d.feature_name}{d.state ? ', ' + d.state.name : ''} ({d.feature_class})
                  </Button>
                ))}
              </ButtonGroup>
            </div>
          </>
        }
      </div>
      <div className="nbm-flex-row-no-padding">
        <Collapse className="settings-dropdown" isOpen={layersDropdownOpen}>
          <Card>
            <span className="header">Basemaps</span>
            <CardBody>
              <RadioGroup style={{width: '100%'}}
                options={basemapOptions}
                onChange={basemapChanged}
                canDeselect={true}
              />
            </CardBody>
          </Card>
        </Collapse>
      </div>

      {displayHelpPopup &&
        <div className="popup" id="helpPopup">
          <img src={speechBubble} alt="Speech Bubble"></img>
          <div className="popuptext" id="myPopup">Search for a place of interest or click on the map</div>
        </div>
      }
    </div>
  )
}

export default SearchBar
