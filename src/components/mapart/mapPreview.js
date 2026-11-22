import React, { Component, createRef } from "react";

import Tooltip from "../tooltip";
import WorkerBuilder from './workers/worker-builder';
import MapCanvasWorker from "./workers/mapCanvas";
import { getZoneMask, getMaskCanvas, getZoneOverlayLayer, zoneAtPixel, buildZoneDitherPayload, zonesRenderSignature, transformKey, canvasToImage } from "./zones";
import { getSourceRect } from "./cropTransform";
import { magicWand } from "./magicWand";

import BackgroundColourModes from "./json/backgroundColourModes.json";
import ColourMethods from "./json/colourMethods.json";
import CropModes from "./json/cropModes.json";
import DitherMethods from "./json/ditherMethods.json";
import MapModes from "./json/mapModes.json";
import WhereSupportBlocksModes from "./json/whereSupportBlocksModes.json";

import IMG_Null from "../../images/null.png";
import IMG_Textures from "../../images/textures.png";
import IMG_GridOverlay from "../../images/gridOverlay.png";

import "./mapPreview.css";

class MapPreview extends Component {
  state = {
    mapPreviewSizeScale: 2,
    workerProgress: 0,
    isDragOver: false,
    dragCounter: 0,
    copyStatus: null, // null | "copied" | "failed"
  };

  mapCanvasWorker = new WorkerBuilder(MapCanvasWorker);

  constructor(props) {
    super(props);
    this.canvasRef_source = createRef(); // hidden source canvas that at all times contains the uploaded image
    this.canvasRef_display = createRef(); // display canvas that displays to the user, may be pixels, may be image
    this.fileInputRef = createRef();
    this.dropZoneRef = createRef();
    this.zoneOverlayRef = createRef();
    this.zoneOverlayCanvasRef = createRef();
    this.zoneStroke = null; // shape currently being drawn: { tool, mode, start, end, points } in canvas pixels
    this.lastZonePaintKey = null;
    this.zoneHover = null; // pointer position (canvas pixels) while hovering with the brush
    this.brushLayer = null; // scratch canvas for drawing the brush preview with an outline
    this.copyStatusTimeout = null;
    this.isUpdatingScale = false;
  }

  shouldCanvasUpdate_source(prevProps, newProps, prevState, newState) {
    const propChanges = [
      prevProps.coloursJSON === newProps.coloursJSON,
      prevProps.selectedBlocks === newProps.selectedBlocks,
      prevProps.disabledTones === newProps.disabledTones,
      prevProps.optionValue_mapSize_x === newProps.optionValue_mapSize_x,
      prevProps.optionValue_mapSize_y === newProps.optionValue_mapSize_y,
      prevProps.optionValue_cropImage === newProps.optionValue_cropImage,
      prevProps.optionValue_cropImage_zoom === newProps.optionValue_cropImage_zoom,
      prevProps.optionValue_cropImage_percent_x === newProps.optionValue_cropImage_percent_x,
      prevProps.optionValue_cropImage_percent_y === newProps.optionValue_cropImage_percent_y,
      prevProps.optionValue_staircasing === newProps.optionValue_staircasing,
      prevProps.optionValue_preprocessingEnabled === newProps.optionValue_preprocessingEnabled,
      prevProps.preProcessingValue_brightness === newProps.preProcessingValue_brightness,
      prevProps.preProcessingValue_contrast === newProps.preProcessingValue_contrast,
      prevProps.preProcessingValue_saturation === newProps.preProcessingValue_saturation,
      prevProps.preProcessingValue_backgroundColourSelect === newProps.preProcessingValue_backgroundColourSelect,
      prevProps.preProcessingValue_backgroundColour === newProps.preProcessingValue_backgroundColour,
      zonesRenderSignature(prevProps.zones) === zonesRenderSignature(newProps.zones),
      prevProps.uploadedImage === newProps.uploadedImage,
    ];
    return (
      newProps.uploadedImage !== null &&
      prevState.workerProgress === newState.workerProgress &&
      !propChanges.every((elt) => {
        return elt === true;
      })
    );
  }

  shouldCanvasUpdate_display(prevProps, newProps, prevState, newState) {
    // ugly but useful method to determine whether map canvas contents should be redrawn on component update
    const propChanges = [
      prevProps.coloursJSON === newProps.coloursJSON,
      prevProps.selectedBlocks === newProps.selectedBlocks,
      prevProps.disabledTones === newProps.disabledTones,
      prevProps.optionValue_modeNBTOrMapdat === newProps.optionValue_modeNBTOrMapdat,
      prevProps.optionValue_mapSize_x === newProps.optionValue_mapSize_x,
      prevProps.optionValue_mapSize_y === newProps.optionValue_mapSize_y,
      prevProps.optionValue_cropImage === newProps.optionValue_cropImage,
      prevProps.optionValue_cropImage_zoom === newProps.optionValue_cropImage_zoom,
      prevProps.optionValue_cropImage_percent_x === newProps.optionValue_cropImage_percent_x,
      prevProps.optionValue_cropImage_percent_y === newProps.optionValue_cropImage_percent_y,
      prevProps.optionValue_staircasing === newProps.optionValue_staircasing,
      prevProps.optionValue_whereSupportBlocks === newProps.optionValue_whereSupportBlocks,
      prevProps.optionValue_transparency === newProps.optionValue_transparency,
      prevProps.optionValue_transparencyTolerance === newProps.optionValue_transparencyTolerance,
      prevProps.optionValue_betterColour === newProps.optionValue_betterColour,
      prevProps.optionValue_dithering === newProps.optionValue_dithering,
      prevProps.optionValue_dithering_propagation_red === newProps.optionValue_dithering_propagation_red,
      prevProps.optionValue_dithering_propagation_green === newProps.optionValue_dithering_propagation_green,
      prevProps.optionValue_dithering_propagation_blue === newProps.optionValue_dithering_propagation_blue,
      prevProps.optionValue_preprocessingEnabled === newProps.optionValue_preprocessingEnabled,
      prevProps.preProcessingValue_brightness === newProps.preProcessingValue_brightness,
      prevProps.preProcessingValue_contrast === newProps.preProcessingValue_contrast,
      prevProps.preProcessingValue_saturation === newProps.preProcessingValue_saturation,
      prevProps.preProcessingValue_backgroundColourSelect === newProps.preProcessingValue_backgroundColourSelect,
      prevProps.preProcessingValue_backgroundColour === newProps.preProcessingValue_backgroundColour,
      zonesRenderSignature(prevProps.zones) === zonesRenderSignature(newProps.zones),
      prevProps.uploadedImage === newProps.uploadedImage,
    ];
    return (
      newProps.uploadedImage !== null &&
      prevState.workerProgress === newState.workerProgress &&
      !propChanges.every((elt) => {
        return elt === true;
      })
    );
  }

  componentDidUpdate(prevProps, prevState) {
    // With static preview, recompute scale when map dimensions change
    if (
      !this.isUpdatingScale && this.props.optionValue_autoZoom && (
        prevProps.optionValue_mapSize_x !== this.props.optionValue_mapSize_x ||
        prevProps.optionValue_mapSize_y !== this.props.optionValue_mapSize_y
      )
    ) {
      try {
        const optimalScale = this.calculateOptimalScale();
        if (optimalScale !== null) {
          this.isUpdatingScale = true;
          this.setState({ mapPreviewSizeScale: optimalScale }, () => {
            this.isUpdatingScale = false;
          });
        }
      } catch (error) {
        console.warn('Error in componentDidUpdate auto-zoom:', error);
        this.isUpdatingScale = false;
      }
    }

    const { W, H } = this.getCanvasSize();
    const zonePaintKey = `${zonesRenderSignature(this.props.zones)}|${this.props.selectedZoneId}|${W}x${H}|${transformKey(this.props.zoneTransform)}|${this.props.zoneBrushSize}`;
    if (zonePaintKey !== this.lastZonePaintKey) {
      this.lastZonePaintKey = zonePaintKey;
      this.paintZoneOverlay();
    }

    if (this.shouldCanvasUpdate_source(prevProps, this.props, prevState, this.state)) {
      this.updateCanvas_source(); // draw uploaded image on source canvas
    }
    if (this.shouldCanvasUpdate_display(prevProps, this.props, prevState, this.state)) {
      this.updateCanvas_display(); // draw pixelart of image on display canvas
    }
  }

  closestSmoothColourTo(colourHex) {
    const { coloursJSON, selectedBlocks, disabledTones, optionValue_staircasing } = this.props;
    const rgbGroups_input = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(colourHex);
    const colourRGB_input = [parseInt(rgbGroups_input[1], 16), parseInt(rgbGroups_input[2], 16), parseInt(rgbGroups_input[3], 16)];
    let smallestDistance = 9999999;
    let colourRGB_return = null;
    for (const [colourSetId, colourSet] of Object.entries(coloursJSON)) {
      if (selectedBlocks[colourSetId] === "-1") {
        continue;
      }
      let coloursRGB_colourSet = [];
      switch (optionValue_staircasing) {
        case MapModes.SCHEMATIC_NBT.staircaseModes.OFF.uniqueId:
        case MapModes.SCHEMATIC_NBT.staircaseModes.CLASSIC.uniqueId:
        case MapModes.SCHEMATIC_NBT.staircaseModes.VALLEY.uniqueId:
        case MapModes.MAPDAT.staircaseModes.OFF.uniqueId: {
          if (!disabledTones[colourSetId].has("normal"))
            coloursRGB_colourSet.push(colourSet.tonesRGB.normal);
          break;
        }
        case MapModes.SCHEMATIC_NBT.staircaseModes.FULL_DARK.uniqueId:
        case MapModes.MAPDAT.staircaseModes.FULL_DARK.uniqueId: {
          if (!disabledTones[colourSetId].has("dark"))
            coloursRGB_colourSet.push(colourSet.tonesRGB.dark);
          break;
        }
        case MapModes.SCHEMATIC_NBT.staircaseModes.FULL_LIGHT.uniqueId:
        case MapModes.MAPDAT.staircaseModes.FULL_LIGHT.uniqueId: {
          if (!disabledTones[colourSetId].has("light"))
            coloursRGB_colourSet.push(colourSet.tonesRGB.light);
          break;
        }
        case MapModes.MAPDAT.staircaseModes.FULL_UNOBTAINABLE.uniqueId: {
          if (!disabledTones[colourSetId].has("unobtainable"))
            coloursRGB_colourSet.push(colourSet.tonesRGB.unobtainable);
          break;
        }
        case MapModes.MAPDAT.staircaseModes.ON.uniqueId: {
          if (!disabledTones[colourSetId].has("dark"))
            coloursRGB_colourSet.push(colourSet.tonesRGB.dark);
          if (!disabledTones[colourSetId].has("normal"))
            coloursRGB_colourSet.push(colourSet.tonesRGB.normal);
          if (!disabledTones[colourSetId].has("light"))
            coloursRGB_colourSet.push(colourSet.tonesRGB.light);
          break;
        }
        case MapModes.MAPDAT.staircaseModes.ON_UNOBTAINABLE.uniqueId: {
          if (!disabledTones[colourSetId].has("dark"))
            coloursRGB_colourSet.push(colourSet.tonesRGB.dark);
          if (!disabledTones[colourSetId].has("normal"))
            coloursRGB_colourSet.push(colourSet.tonesRGB.normal);
          if (!disabledTones[colourSetId].has("light"))
            coloursRGB_colourSet.push(colourSet.tonesRGB.light);
          if (!disabledTones[colourSetId].has("unobtainable"))
            coloursRGB_colourSet.push(colourSet.tonesRGB.unobtainable);
          break;
        }
        default: {
          throw new Error("Unknown staircasing mode");
        }
      }
      for (const colourRGB_colourSet of coloursRGB_colourSet) {
        const colourDistance =
          Math.pow(colourRGB_input[0] - colourRGB_colourSet[0], 2) +
          Math.pow(colourRGB_input[1] - colourRGB_colourSet[1], 2) +
          Math.pow(colourRGB_input[2] - colourRGB_colourSet[2], 2);
        if (colourDistance < smallestDistance) {
          smallestDistance = colourDistance;
          colourRGB_return = colourRGB_colourSet;
        }
      }
    }
    const colourHex_return = `#${colourRGB_return[0].toString(16).padStart(2, "0")}${colourRGB_return[1].toString(16).padStart(2, "0")}${colourRGB_return[2]
      .toString(16)
      .padStart(2, "0")}`;
    return colourHex_return;
  }

  updateCanvas_source() {
    const { zones } = this.props;
    const { canvasRef_source } = this;
    const ctx_source = canvasRef_source.current.getContext("2d", { willReadFrequently: true });
    ctx_source.imageSmoothingEnabled = true;   // These two options keep the map preview consistent on Chrome(ium). Otherwise the first render after changing
    ctx_source.imageSmoothingQuality = "high"; // map x or z size is pixelated to a noticeably lower quality. This is not a solution to the cause but a
                                               // workaround the effect (I do not know exactly why this happens: maybe it is to do with
                                               // anti-fingerprinting). Firefox is unaffected by any of this.
    ctx_source.clearRect(0, 0, ctx_source.canvas.width, ctx_source.canvas.height);

    // whole image with the global image corrections
    this.drawSourceImage(ctx_source, null);

    // zones that override the image corrections: render the whole image with the zone's own corrections and
    // composite it over the global rendering through the zone's mask (later zones are drawn on top)
    const width = ctx_source.canvas.width;
    const height = ctx_source.canvas.height;
    for (const zone of zones || []) {
      if (!zone.overrideCorrections) continue;
      const { mask, count } = getZoneMask(zone, width, height, this.props.zoneTransform);
      if (count === 0) continue;
      const maskCanvas = getMaskCanvas(mask, width, height);
      const layer = document.createElement("canvas");
      layer.width = width;
      layer.height = height;
      const layerCtx = layer.getContext("2d");
      layerCtx.imageSmoothingEnabled = true;
      layerCtx.imageSmoothingQuality = "high";
      this.drawSourceImage(layerCtx, { brightness: zone.brightness, contrast: zone.contrast, saturation: zone.saturation });
      layerCtx.filter = "none";
      layerCtx.globalCompositeOperation = "destination-in";
      layerCtx.drawImage(maskCanvas, 0, 0); // keep only the zone's pixels
      ctx_source.filter = "none"; // the global filter must not be applied to the compositing steps
      ctx_source.globalCompositeOperation = "destination-out";
      ctx_source.drawImage(maskCanvas, 0, 0); // cut the zone out of the globally corrected image
      ctx_source.globalCompositeOperation = "source-over";
      ctx_source.drawImage(layer, 0, 0);
    }
  }

  // Draws background colour and the (cropped) uploaded image. correctionsOverride = null uses the global
  // preprocessing settings; otherwise { brightness, contrast, saturation } of a zone are applied.
  drawSourceImage(ctx_source, correctionsOverride) {
    const {
      selectedBlocks,
      optionValue_preprocessingEnabled,
      preProcessingValue_brightness,
      preProcessingValue_contrast,
      preProcessingValue_saturation,
      preProcessingValue_backgroundColourSelect,
      preProcessingValue_backgroundColour,
      uploadedImage,
    } = this.props;
    const {
      optionValue_mapSize_x,
      optionValue_mapSize_y,
      optionValue_cropImage,
      optionValue_cropImage_zoom,
      optionValue_cropImage_percent_x,
      optionValue_cropImage_percent_y,
    } = this.props;

    if (optionValue_preprocessingEnabled) {
      if (preProcessingValue_backgroundColourSelect !== BackgroundColourModes.OFF.uniqueId && /^#?[a-f\d]{6}$/i.test(preProcessingValue_backgroundColour)) {
        let backgroundColour;
        if (
          preProcessingValue_backgroundColourSelect === BackgroundColourModes.SMOOTH.uniqueId &&
          !Object.values(selectedBlocks).every((selectedBlockId) => selectedBlockId === "-1")
        ) {
          backgroundColour = this.closestSmoothColourTo(preProcessingValue_backgroundColour);
        } else {
          backgroundColour = preProcessingValue_backgroundColour;
        }
        ctx_source.filter = "none"; // this needs to be present to stop filters affecting background colour
        ctx_source.fillStyle = backgroundColour;
        ctx_source.fillRect(0, 0, ctx_source.canvas.width, ctx_source.canvas.height);
      }
    }
    if (correctionsOverride !== null) {
      ctx_source.filter = `brightness(${correctionsOverride.brightness}%) contrast(${correctionsOverride.contrast}%) saturate(${correctionsOverride.saturation}%)`;
    } else if (optionValue_preprocessingEnabled) {
      ctx_source.filter = `brightness(${preProcessingValue_brightness}%) contrast(${preProcessingValue_contrast}%) saturate(${preProcessingValue_saturation}%)`;
    } else {
      ctx_source.filter = "none";
    }

    if (![CropModes.OFF.uniqueId, CropModes.CENTER.uniqueId, CropModes.MANUAL.uniqueId].includes(optionValue_cropImage)) {
      throw new Error("Unknown optionValue_cropImage");
    }
    // the same source rectangle is used to anchor zones to the picture, see cropTransform.js
    const { sx, sy, sw, sh } = getSourceRect({
      cropOff: optionValue_cropImage === CropModes.OFF.uniqueId,
      imgW: uploadedImage.width,
      imgH: uploadedImage.height,
      mapSizeX: optionValue_mapSize_x,
      mapSizeY: optionValue_mapSize_y,
      zoom: optionValue_cropImage_zoom,
      percentX: optionValue_cropImage_percent_x,
      percentY: optionValue_cropImage_percent_y,
    });
    ctx_source.drawImage(uploadedImage, sx, sy, sw, sh, 0, 0, ctx_source.canvas.width, ctx_source.canvas.height);
  }

  updateCanvas_display() {
    this.mapCanvasWorker.terminate();
    const { canvasRef_source, canvasRef_display } = this;
    const {
      coloursJSON,
      selectedBlocks,
      disabledTones,
      optionValue_modeNBTOrMapdat,
      optionValue_mapSize_x,
      optionValue_mapSize_y,
      optionValue_staircasing,
      optionValue_whereSupportBlocks,
      optionValue_transparency,
      optionValue_transparencyTolerance,
      optionValue_betterColour,
      optionValue_dithering,
      optionValue_dithering_propagation_red,
      optionValue_dithering_propagation_green,
      optionValue_dithering_propagation_blue,
      onGetMapMaterials,
      onMapPreviewWorker_begin,
    } = this.props;
    const ctx_source = canvasRef_source.current.getContext("2d", { willReadFrequently: true });
    const canvasImageData = ctx_source.getImageData(0, 0, ctx_source.canvas.width, ctx_source.canvas.height);
    const { zoneMask, zoneDitherSettings } = buildZoneDitherPayload(this.props.zones, ctx_source.canvas.width, ctx_source.canvas.height, this.props.zoneTransform);
    const t0 = performance.now();
    this.mapCanvasWorker = new WorkerBuilder(MapCanvasWorker);
    this.mapCanvasWorker.onmessage = (e) => {
      if (e.data.head === "PIXELS_MATERIALS_CURRENTSELECTEDBLOCKS") {
        const t1 = performance.now();
        console.log(`Calculated map preview data in ${(t1 - t0).toString()}ms`);
        const ctx_display = canvasRef_display.current.getContext("2d", { willReadFrequently: true });
        ctx_display.putImageData(e.data.body.pixels, 0, 0);
        this.setState({ workerProgress: 1 });
        onGetMapMaterials({
          pixelsData: e.data.body.pixels.data,
          maps: e.data.body.maps,
          currentSelectedBlocks: e.data.body.currentSelectedBlocks,
        });
      } else if (e.data.head === "PROGRESS_REPORT") {
        this.setState({ workerProgress: e.data.body });
      }
    };
    onMapPreviewWorker_begin();
    this.mapCanvasWorker.postMessage({
      head: "PIXELS",
      body: {
        coloursJSON: coloursJSON,
        MapModes: MapModes,
        WhereSupportBlocksModes: WhereSupportBlocksModes,
        ColourMethods: ColourMethods,
        DitherMethods: DitherMethods,
        canvasImageData: canvasImageData,
        selectedBlocks: selectedBlocks,
        disabledTones: disabledTones,
        optionValue_modeNBTOrMapdat: optionValue_modeNBTOrMapdat,
        optionValue_mapSize_x: optionValue_mapSize_x,
        optionValue_mapSize_y: optionValue_mapSize_y,
        optionValue_staircasing: optionValue_staircasing,
        optionValue_whereSupportBlocks: optionValue_whereSupportBlocks,
        optionValue_transparency: optionValue_transparency,
        optionValue_transparencyTolerance: optionValue_transparencyTolerance,
        optionValue_betterColour: optionValue_betterColour,
        optionValue_dithering: optionValue_dithering,
        optionValue_dithering_propagation_red: optionValue_dithering_propagation_red,
        optionValue_dithering_propagation_green: optionValue_dithering_propagation_green,
        optionValue_dithering_propagation_blue: optionValue_dithering_propagation_blue,
        zoneMask: zoneMask,
        zoneDitherSettings: zoneDitherSettings,
      },
    });
  }

  increasePreviewScale = () => {
    try {
      const newScale = this.state.mapPreviewSizeScale * 1.2;
      this.setState({
        mapPreviewSizeScale: newScale,
      });
    } catch (error) {
      console.warn('Error in increasePreviewScale:', error);
    }
  };

  decreasePreviewScale = () => {
    try {
      this.setState({
        mapPreviewSizeScale: this.state.mapPreviewSizeScale / 1.2,
      });
    } catch (error) {
      console.warn('Error in decreasePreviewScale:', error);
    }
  };

  calculateOptimalScale = () => {
    try {
      const { optionValue_mapSize_x, optionValue_mapSize_y, optionValue_autoZoom } = this.props;
      if (!optionValue_autoZoom || this.isUpdatingScale) return null;

      // fit into the real preview area (it follows the window / layout), falling back to the old fixed size
      const container = this.dropZoneRef.current;
      const measuredWidth = container ? container.clientWidth - 16 : 0;
      const measuredHeight = container ? container.clientHeight - 16 : 0;
      const containerWidth = measuredWidth > 50 ? measuredWidth : 788;
      const containerHeight = measuredHeight > 50 ? measuredHeight : 500;

      const mapWidth = 128 * optionValue_mapSize_x;
      const mapHeight = 128 * optionValue_mapSize_y;

      if (mapWidth <= 0 || mapHeight <= 0) return null;

      const maxScaleX = containerWidth / mapWidth;
      const maxScaleY = containerHeight / mapHeight;
      const optimalScale = Math.min(maxScaleX, maxScaleY);

      const minScale = 0.2;
      
      return Math.max(optimalScale, minScale);
    } catch (error) {
      console.warn('Error in calculateOptimalScale:', error);
      return null;
    }
  };

  handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    this.setState(prevState => ({
      dragCounter: prevState.dragCounter + 1,
      isDragOver: true
    }));
  };

  handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    this.setState(prevState => {
      const newCounter = prevState.dragCounter - 1;
      return {
        dragCounter: newCounter,
        isDragOver: newCounter === 0 ? false : prevState.isDragOver
      };
    });
  };

  handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    this.setState({
      isDragOver: false,
      dragCounter: 0
    });

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];

      if (file.type.startsWith('image/')) {
        this.props.onFileDialogEvent({ target: { files: [file] } });
      }
    }
  };

  // ----- zone shape tools -----
  getCanvasSize = () => ({ W: 128 * this.props.optionValue_mapSize_x, H: 128 * this.props.optionValue_mapSize_y });

  pointerToCanvas = (e) => {
    const box = this.zoneOverlayRef.current.getBoundingClientRect();
    const { W, H } = this.getCanvasSize();
    const clamp = (v, max) => Math.max(0, Math.min(max, v));
    return { x: clamp(((e.clientX - box.left) / box.width) * W, W), y: clamp(((e.clientY - box.top) / box.height) * H, H) };
  };

  strokeRect = (stroke) => {
    const end = stroke.end || stroke.start;
    return {
      x0: Math.round(Math.min(stroke.start.x, end.x)),
      y0: Math.round(Math.min(stroke.start.y, end.y)),
      x1: Math.round(Math.max(stroke.start.x, end.x)),
      y1: Math.round(Math.max(stroke.start.y, end.y)),
    };
  };

  handleZonePointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const { zoneTool, zoneEditMode, zones } = this.props;
    const { W, H } = this.getCanvasSize();
    const point = this.pointerToCanvas(e);
    if (zoneTool === "select") {
      const hit = zoneAtPixel(zones, W, H, this.props.zoneTransform, point.x, point.y);
      this.props.onZoneSelect(hit ? hit.id : null);
      return;
    }
    const mode = e.altKey ? (zoneEditMode === "add" ? "subtract" : "add") : zoneEditMode; // Alt temporarily flips Add/Subtract
    if (zoneTool === "wand") {
      this.applyMagicWand(point, mode);
      return;
    }
    this.zoneOverlayRef.current.setPointerCapture(e.pointerId);
    this.zoneStroke = { tool: zoneTool, mode, start: point, end: point, points: [point] };
    this.paintZoneOverlay();
  };

  handleZonePointerMove = (e) => {
    const stroke = this.zoneStroke;
    const point = this.pointerToCanvas(e);
    if (!stroke) {
      if (this.props.zoneTool === "brush") {
        this.zoneHover = point; // the brush shows its outline under the pointer before drawing
        this.paintZoneOverlay();
      }
      return;
    }
    stroke.end = point;
    if (stroke.tool !== "rect") {
      const last = stroke.points[stroke.points.length - 1];
      if (Math.hypot(point.x - last.x, point.y - last.y) >= 0.5) stroke.points.push(point);
    }
    this.paintZoneOverlay();
  };

  handleZonePointerLeave = () => {
    if (this.zoneHover === null) return;
    this.zoneHover = null;
    this.paintZoneOverlay();
  };

  handleZonePointerUp = (e) => {
    const stroke = this.zoneStroke;
    if (!stroke) return;
    this.zoneHover = this.pointerToCanvas(e);
    this.zoneStroke = null;
    const T = this.props.zoneTransform;
    const toImage = (point) => canvasToImage(T, point.x, point.y); // zones are stored relative to the picture
    if (stroke.tool === "rect") {
      const r = this.strokeRect(stroke);
      if (r.x1 - r.x0 >= 1 && r.y1 - r.y0 >= 1) {
        this.props.onZoneApplyShape({ mode: stroke.mode, shape: { type: "rect", x: (r.x0 - T.bx) / T.ax, y: (r.y0 - T.by) / T.ay, w: (r.x1 - r.x0) / T.ax, h: (r.y1 - r.y0) / T.ay } });
      }
    } else if (stroke.tool === "lasso") {
      let area = 0; // shoelace formula, in canvas pixels
      stroke.points.forEach((a, index) => {
        const b = stroke.points[(index + 1) % stroke.points.length];
        area += a.x * b.y - b.x * a.y;
      });
      if (stroke.points.length >= 3 && Math.abs(area) / 2 >= 1) {
        this.props.onZoneApplyShape({ mode: stroke.mode, shape: { type: "poly", points: stroke.points.map(toImage) } });
      }
    } else if (stroke.tool === "brush") {
      this.props.onZoneApplyShape({
        mode: stroke.mode,
        shape: { type: "brush", points: stroke.points.map(toImage), radius: this.props.zoneBrushSize / 2 / T.ax },
      });
    }
    this.paintZoneOverlay();
  };

  handleZonePointerCancel = () => {
    this.zoneStroke = null;
    this.paintZoneOverlay();
  };

  applyMagicWand = (point, mode) => {
    const { uploadedImage, zoneWandTolerance, zoneWandContiguous, zoneWandRespectEdges } = this.props;
    if (uploadedImage === null) return;
    const { W, H } = this.getCanvasSize();
    // the wand looks at the image as it is placed on the map, without any image corrections
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    this.drawSourceImage(ctx, { brightness: 100, contrast: 100, saturation: 100 });
    const { data } = ctx.getImageData(0, 0, W, H);
    const selection = magicWand(data, W, H, Math.floor(point.x), Math.floor(point.y), zoneWandTolerance, zoneWandContiguous, zoneWandRespectEdges);
    if (selection.some((v) => v === 1)) {
      const T = this.props.zoneTransform;
      this.props.onZoneApplyShape({ mode, shape: { type: "bitmap", w: W, h: H, data: selection, t: { ax: T.ax, bx: T.bx, ay: T.ay, by: T.by } } });
    }
  };

  // One screen pixel expressed in canvas pixels, so outlines keep the same thickness at every preview scale.
  screenPixel = () => 1 / Math.max(0.35, this.state.mapPreviewSizeScale);

  // The brush stroke is drawn with a light and a dark ring around it, so its edge is visible on any background.
  paintBrushStroke = (ctx, stroke, colour) => {
    const size = this.props.zoneBrushSize;
    const { W, H } = this.getCanvasSize();
    if (this.brushLayer === null) this.brushLayer = document.createElement("canvas");
    const layer = this.brushLayer;
    if (layer.width !== W || layer.height !== H) {
      layer.width = W;
      layer.height = H;
    }
    const lctx = layer.getContext("2d");
    lctx.clearRect(0, 0, W, H);
    lctx.lineCap = "round";
    lctx.lineJoin = "round";
    const trace = (width, style) => {
      lctx.strokeStyle = style;
      lctx.fillStyle = style;
      lctx.lineWidth = width;
      lctx.beginPath();
      if (stroke.points.length === 1) {
        lctx.arc(stroke.points[0].x, stroke.points[0].y, width / 2, 0, Math.PI * 2);
        lctx.fill();
      } else {
        stroke.points.forEach((pt, index) => (index === 0 ? lctx.moveTo(pt.x, pt.y) : lctx.lineTo(pt.x, pt.y)));
        lctx.stroke();
      }
    };
    const e = this.screenPixel();
    lctx.globalCompositeOperation = "source-over";
    trace(size + 4 * e, "rgba(255, 255, 255, 0.95)"); // outer light ring, 1 screen pixel
    trace(size + 2 * e, "rgba(0, 0, 0, 0.9)"); // inner dark ring, 1 screen pixel
    lctx.globalCompositeOperation = "destination-out";
    trace(size, "rgba(0, 0, 0, 1)"); // hollow out the inside again
    lctx.globalCompositeOperation = "source-over";
    trace(size, `rgba(${colour}, 0.5)`); // translucent add/subtract colour
    ctx.drawImage(layer, 0, 0);
  };

  // Outline of the brush under the pointer while no stroke is being drawn.
  paintBrushHover = (ctx) => {
    const { zoneDrawMode, zoneTool, zoneBrushSize } = this.props;
    if (!zoneDrawMode || zoneTool !== "brush" || this.zoneHover === null) return;
    const e = this.screenPixel();
    ctx.beginPath();
    ctx.arc(this.zoneHover.x, this.zoneHover.y, zoneBrushSize / 2, 0, Math.PI * 2);
    ctx.lineWidth = 3 * e;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.stroke();
    ctx.lineWidth = e;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.95)";
    ctx.stroke();
  };

  // Copies the map preview itself (one pixel per block), not the zone outline canvas that lies on top of it.
  copyPreviewToClipboard = async () => {
    const canvas = this.canvasRef_display.current;
    let status = "failed";
    try {
      if (!navigator.clipboard || typeof ClipboardItem === "undefined") throw new Error("Clipboard API for images is not available");
      const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      status = "copied";
    } catch (error) {
      console.warn("Could not copy the map preview:", error);
    }
    clearTimeout(this.copyStatusTimeout);
    this.setState({ copyStatus: status });
    this.copyStatusTimeout = setTimeout(() => this.setState({ copyStatus: null }), 2000);
  };

  paintZoneOverlay = () => {
    const canvas = this.zoneOverlayCanvasRef.current;
    if (!canvas) return;
    const { zones, selectedZoneId } = this.props;
    const { W, H } = this.getCanvasSize();
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const ordered = [...zones.filter((zone) => zone.id !== selectedZoneId), ...zones.filter((zone) => zone.id === selectedZoneId)];
    for (const zone of ordered) {
      const { mask, count } = getZoneMask(zone, W, H, this.props.zoneTransform);
      if (count > 0) ctx.drawImage(getZoneOverlayLayer(mask, W, H, zone.id === selectedZoneId), 0, 0);
    }

    const stroke = this.zoneStroke;
    if (!stroke) {
      this.paintBrushHover(ctx);
      return;
    }
    const colour = stroke.mode === "add" ? "80, 220, 120" : "255, 90, 90";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(${colour}, 0.95)`;
    ctx.fillStyle = `rgba(${colour}, 0.25)`;
    if (stroke.tool === "rect") {
      const r = this.strokeRect(stroke);
      ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
      ctx.strokeRect(r.x0 + 0.5, r.y0 + 0.5, Math.max(0, r.x1 - r.x0 - 1), Math.max(0, r.y1 - r.y0 - 1));
    } else if (stroke.tool === "lasso") {
      ctx.beginPath();
      stroke.points.forEach((pt, index) => (index === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (stroke.tool === "brush") {
      this.paintBrushStroke(ctx, stroke, colour);
    }
  };

  componentDidMount() {
    this.paintZoneOverlay();
    if (typeof ResizeObserver !== "undefined" && this.dropZoneRef.current) {
      this.resizeObserver = new ResizeObserver(() => this.updateAutoScale());
      this.resizeObserver.observe(this.dropZoneRef.current);
    }
  }

  // re-fit the preview when its container changes size (window resize, layout change)
  updateAutoScale = () => {
    if (!this.props.optionValue_autoZoom || this.isUpdatingScale) return;
    const optimalScale = this.calculateOptimalScale();
    if (optimalScale !== null && Math.abs(optimalScale - this.state.mapPreviewSizeScale) > 0.005) {
      this.isUpdatingScale = true;
      this.setState({ mapPreviewSizeScale: optimalScale }, () => {
        this.isUpdatingScale = false;
      });
    }
  };

  componentWillUnmount() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    clearTimeout(this.copyStatusTimeout);
    this.mapCanvasWorker.terminate();
  }

  render() {
    const {
      getLocaleString,
      optionValue_mapSize_x, // map size in maps
      optionValue_mapSize_y,
      optionValue_cropImage,
      optionValue_showGridOverlay,
      optionValue_autoZoom, // eslint-disable-line no-unused-vars
      onFileDialogEvent,
      uploadedImage,
      zones,
      selectedZoneId,
      zoneDrawMode,
      zoneTool,
    } = this.props;
    const { mapPreviewSizeScale, workerProgress, isDragOver, copyStatus } = this.state;
    return (
      <div className={`section mapPreviewDiv ${optionValue_autoZoom ? 'autoZoomEnabled' : ''}`}>
        <h2>{getLocaleString("MAP-PREVIEW/TITLE")}</h2>
        <input type="file" className="imgUpload" accept=".jpg,.jpeg,.png,image/jpeg,image/png" ref={this.fileInputRef} onChange={onFileDialogEvent} />
        
        <div 
          className={`${optionValue_autoZoom ? "autoZoomContainer" : ""} dropZone ${isDragOver ? 'dragOver' : ''}`}
          ref={this.dropZoneRef}
          onDragEnter={this.handleDragEnter}
          onDragLeave={this.handleDragLeave}
          onDragOver={this.handleDragOver}
          onDrop={this.handleDrop}
        >
          <div className={optionValue_autoZoom ? "canvasContainer" : ""}>
            <span
              className="gridOverlay"
              style={{
                backgroundImage: `url(${IMG_GridOverlay})`,
                display: optionValue_showGridOverlay ? "block" : "none",
                width: `${(mapPreviewSizeScale * 128 * optionValue_mapSize_x).toString()}px`,
                height: `${(mapPreviewSizeScale * 128 * optionValue_mapSize_y).toString()}px`,
                backgroundSize: `${(mapPreviewSizeScale * 128).toString()}px`,
              }}
            />
            <div
              ref={this.zoneOverlayRef}
              className={`zoneOverlay ${zoneDrawMode ? "drawing" : ""} tool-${zoneTool}`}
              style={{
                display: zones.length > 0 || zoneDrawMode ? "block" : "none",
                width: `${(mapPreviewSizeScale * 128 * optionValue_mapSize_x).toString()}px`,
                height: `${(mapPreviewSizeScale * 128 * optionValue_mapSize_y).toString()}px`,
              }}
              onPointerDown={zoneDrawMode ? this.handleZonePointerDown : undefined}
              onPointerMove={zoneDrawMode ? this.handleZonePointerMove : undefined}
              onPointerUp={zoneDrawMode ? this.handleZonePointerUp : undefined}
              onPointerCancel={zoneDrawMode ? this.handleZonePointerCancel : undefined}
              onPointerLeave={zoneDrawMode ? this.handleZonePointerLeave : undefined}
            >
              <canvas ref={this.zoneOverlayCanvasRef} className="zoneOverlayCanvas" width={128 * optionValue_mapSize_x} height={128 * optionValue_mapSize_y} />
              {zones.map((zone) => {
                const { bbox } = getZoneMask(zone, 128 * optionValue_mapSize_x, 128 * optionValue_mapSize_y, this.props.zoneTransform);
                if (bbox === null) return null;
                return (
                  <span
                    key={zone.id}
                    className={`zoneLabel ${zone.id === selectedZoneId ? "selected" : ""}`}
                    style={{ left: `${(bbox.x0 / (128 * optionValue_mapSize_x)) * 100}%`, top: `${(bbox.y0 / (128 * optionValue_mapSize_y)) * 100}%`, maxWidth: `${((bbox.x1 - bbox.x0) / (128 * optionValue_mapSize_x)) * 100}%` }}
                  >
                    {zone.name}
                  </span>
                );
              })}
            </div>
            <canvas
              className="mapCanvas"
              width={128 * optionValue_mapSize_x}
              height={128 * optionValue_mapSize_y}
              ref={this.canvasRef_display}
              style={{
                width: `${(mapPreviewSizeScale * 128 * optionValue_mapSize_x).toString()}px`,
                height: `${(mapPreviewSizeScale * 128 * optionValue_mapSize_y).toString()}px`,
              }}
              onClick={() => this.fileInputRef.current.click()}
            />
            <canvas className="displayNone" width={128 * optionValue_mapSize_x} height={128 * optionValue_mapSize_y} ref={this.canvasRef_source}></canvas>
          </div>
        </div>
        
        <div className="mapResolutionAndZoom">
          <div>
            <Tooltip tooltipText={getLocaleString("MAP-PREVIEW/BEST-RESOLUTION-TT")}>
              <small>{`${(128 * optionValue_mapSize_x).toString()}x${(128 * optionValue_mapSize_y).toString()}`}</small>
            </Tooltip>{" "}
            <Tooltip tooltipText={getLocaleString("MAP-PREVIEW/ASPECT-RATIO-MISMATCH-TT")}>
              <small
                className="mapResWarning"
                style={{
                  display:
                    uploadedImage === null || uploadedImage.height * optionValue_mapSize_x === uploadedImage.width * optionValue_mapSize_y ? "none" : "inline",
                  color: optionValue_cropImage === CropModes.OFF.uniqueId ? "red" : "orange",
                }}
              >
                {uploadedImage === null ? null : `${uploadedImage.width.toString()}x${uploadedImage.height.toString()}`}
              </small>
            </Tooltip>
          </div>
          <div className="previewActions">
            <Tooltip tooltipText={getLocaleString("MAP-PREVIEW/COPY-TT")}>
              <button type="button" className="copyPreviewButton" disabled={uploadedImage === null} onClick={this.copyPreviewToClipboard}>
                {copyStatus === "copied" ? getLocaleString("MAP-PREVIEW/COPIED") : copyStatus === "failed" ? getLocaleString("MAP-PREVIEW/COPY-FAILED") : getLocaleString("MAP-PREVIEW/COPY")}
              </button>
            </Tooltip>
            <Tooltip tooltipText={getLocaleString("MAP-PREVIEW/SCALE-PLUS-TT")}>
              <img
                alt="+"
                className="sizeButton"
                src={IMG_Null}
                style={{
                  backgroundImage: `url(${IMG_Textures})`,
                  backgroundPositionX: "-96px",
                  backgroundPositionY: "-2048px",
                }}
                onClick={this.increasePreviewScale}
              />
            </Tooltip>
            <Tooltip tooltipText={getLocaleString("MAP-PREVIEW/SCALE-MINUS-TT")}>
              <img
                alt="-"
                className="sizeButton"
                src={IMG_Null}
                style={{
                  backgroundImage: `url(${IMG_Textures})`,
                  backgroundPositionX: "-128px",
                  backgroundPositionY: "-2048px",
                }}
                onClick={this.decreasePreviewScale}
              />
            </Tooltip>
          </div>
        </div>
        <div
          className="progress"
          style={
            [0, 1].includes(workerProgress)
              ? {
                  display: "unset",
                  visibility: "hidden",
                }
              : { display: "block" }
          }
        >
          <span className="progressText">{`${Math.floor(workerProgress * 100)}%`}</span>
          <div
            className="progressDiv"
            style={{
              width: `${Math.floor(workerProgress * 100)}%`,
            }}
          />
        </div>
      </div>
    );
  }
}

export default MapPreview;
