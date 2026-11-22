import React, { useState } from "react";

import DitherMethods from "./json/ditherMethods.json";
import { MAX_ZONES, getSimpleRect } from "./zones";

const TOOLS = [
  { id: "select", glyph: "⌖", key: "ZONES/TOOL-SELECT" },
  { id: "rect", glyph: "▭", key: "ZONES/TOOL-RECT" },
  { id: "lasso", glyph: "➰", key: "ZONES/TOOL-LASSO" },
  { id: "brush", glyph: "●", key: "ZONES/TOOL-BRUSH" },
  { id: "wand", glyph: "✦", key: "ZONES/TOOL-WAND" },
];

// Panel for managing zones: list, shape tools, and per-zone settings editor.
function MapZones({
  getLocaleString,
  zones,
  selectedZoneId,
  zoneDrawMode,
  zoneTool,
  zoneEditMode,
  zoneBrushSize,
  zoneWandTolerance,
  zoneWandContiguous,
  zoneWandRespectEdges,
  canvasWidth,
  canvasHeight,
  zoneTransform,
  onZoneToolSettingsChange,
  onZoneDrawModeToggle,
  onZoneCreate,
  onZoneSelect,
  onZoneUpdate,
  onZoneDelete,
  onZoneMove,
}) {
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) || null;
  const t = getLocaleString;

  const slider = (label, key, min, max) => (
    <label className="zoneRow">
      <span>{label}</span>
      <input type="range" min={min} max={max} value={selectedZone[key]} onChange={(e) => onZoneUpdate(selectedZone.id, { [key]: parseInt(e.target.value) })} />
      <span className="zoneValue">{selectedZone[key]}</span>
    </label>
  );

  const toolSlider = (label, key, value, min, max) => (
    <label className="zoneRow">
      <span>{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onZoneToolSettingsChange({ [key]: parseInt(e.target.value) })} />
      <span className="zoneValue">{value}</span>
    </label>
  );

  // numeric position/size is only offered for zones that are a single rectangle
  const simpleRect = selectedZone === null ? null : getSimpleRect(selectedZone);
  const rectInput = (label, field) => {
    // the rectangle is stored relative to the picture; the inputs show its current place on the map, in blocks
    const T = zoneTransform;
    const isX = field === "x" || field === "w";
    const total = isX ? canvasWidth : canvasHeight;
    const x0 = Math.round(T.ax * simpleRect.x + T.bx);
    const y0 = Math.round(T.ay * simpleRect.y + T.by);
    const pixels = {
      x: x0,
      y: y0,
      w: Math.round(T.ax * (simpleRect.x + simpleRect.w) + T.bx) - x0,
      h: Math.round(T.ay * (simpleRect.y + simpleRect.h) + T.by) - y0,
    };
    const onChange = (e) => {
      const value = parseInt(e.target.value);
      if (isNaN(value)) return;
      const next = { ...pixels, [field]: value };
      const origin = isX ? "x" : "y";
      const size = isX ? "w" : "h";
      next[size] = Math.max(1, Math.min(next[size], total));
      next[origin] = Math.max(0, Math.min(next[origin], total - next[size]));
      onZoneUpdate(selectedZone.id, {
        ops: [{ mode: "add", shape: { type: "rect", x: (next.x - T.bx) / T.ax, y: (next.y - T.by) / T.ay, w: next.w / T.ax, h: next.h / T.ay } }],
      });
    };
    return (
      <label className="zoneRectInput">
        <span>{label}</span>
        <input type="number" min="0" max={total} value={pixels[field]} onChange={onChange} />
      </label>
    );
  };

  return (
    <div className="mapZones">
      <div className="zoneHeader">
        <span className="zoneHeaderButtons">
          <button className="zoneButton" onClick={onZoneCreate} disabled={zones.length >= MAX_ZONES} title={t("ZONES/NEW-TT")}>
            {t("ZONES/NEW")}
          </button>
          <button className={`zoneButton ${zoneDrawMode ? "active" : ""}`} onClick={onZoneDrawModeToggle}>
            {zoneDrawMode ? t("ZONES/STOP-DRAWING") : t("ZONES/DRAW")}
          </button>
        </span>
      </div>
      <small className="zoneHint">{zoneDrawMode ? t("ZONES/DRAW-HINT") : t("ZONES/HINT")}</small>

      {zoneDrawMode ? (
        <div className="zoneToolbar">
          <div className="zoneTools">
            {TOOLS.map((tool) => (
              <button key={tool.id} className={`zoneButton ${zoneTool === tool.id ? "active" : ""}`} onClick={() => onZoneToolSettingsChange({ zoneTool: tool.id })} title={t(tool.key)}>
                <span className="zoneToolGlyph">{tool.glyph}</span> {t(tool.key)}
              </button>
            ))}
          </div>
          {zoneTool === "select" ? null : (
            <div className="zoneTools">
              <button className={`zoneButton ${zoneEditMode === "add" ? "active" : ""}`} onClick={() => onZoneToolSettingsChange({ zoneEditMode: "add" })}>
                ＋ {t("ZONES/MODE-ADD")}
              </button>
              <button className={`zoneButton ${zoneEditMode === "subtract" ? "active" : ""}`} onClick={() => onZoneToolSettingsChange({ zoneEditMode: "subtract" })}>
                − {t("ZONES/MODE-SUBTRACT")}
              </button>
              <button className="zoneButton" disabled={selectedZone === null || selectedZone.ops.length === 0} onClick={() => onZoneUpdate(selectedZone.id, { ops: selectedZone.ops.slice(0, -1) })}>
                ↶ {t("ZONES/UNDO")}
              </button>
              <button className="zoneButton" disabled={selectedZone === null || selectedZone.ops.length === 0} onClick={() => onZoneUpdate(selectedZone.id, { ops: [] })}>
                {t("ZONES/CLEAR")}
              </button>
            </div>
          )}
          {zoneTool === "brush" ? toolSlider(t("ZONES/BRUSH-SIZE"), "zoneBrushSize", zoneBrushSize, 1, 40) : null}
          {zoneTool === "wand" ? (
            <div>
              {toolSlider(t("ZONES/WAND-TOLERANCE"), "zoneWandTolerance", zoneWandTolerance, 0, 100)}
              <label className="zoneOverride">
                <input type="checkbox" checked={zoneWandContiguous} onChange={(e) => onZoneToolSettingsChange({ zoneWandContiguous: e.target.checked })} />
                {t("ZONES/WAND-CONTIGUOUS")}
              </label>
              <label className="zoneOverride">
                <input type="checkbox" checked={zoneWandRespectEdges} onChange={(e) => onZoneToolSettingsChange({ zoneWandRespectEdges: e.target.checked })} />
                {t("ZONES/WAND-EDGES")}
              </label>
            </div>
          ) : null}
          <small className="zoneHint">
            {selectedZone === null ? t("ZONES/TARGET-NEW") : `${t("ZONES/TARGET")} ${selectedZone.name}`}
            {zoneTool === "select" ? "" : ` · ${t("ZONES/ALT-HINT")}`}
          </small>
        </div>
      ) : null}

      {zones.length === 0 ? null : (
        <ul className="zoneList">
          {zones.map((zone, index) => (
            <li
              key={zone.id}
              className={`${zone.id === selectedZoneId ? "selected" : ""} ${zone.id === dragId ? "dragging" : ""} ${zone.id === dragOverId && zone.id !== dragId ? "dragOver" : ""}`}
              draggable={renamingId !== zone.id}
              onClick={() => onZoneSelect(zone.id)}
              onDragStart={(e) => {
                setDragId(zone.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(zone.id)); // Firefox needs data to start a drag
              }}
              onDragOver={(e) => {
                if (dragId === null) return;
                e.preventDefault();
                setDragOverId(zone.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId !== null && dragId !== zone.id) onZoneMove(dragId, index);
                setDragId(null);
                setDragOverId(null);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDragOverId(null);
              }}
            >
              <span className="zoneGrip" title={t("ZONES/DRAG-TT")}>
                ⠿
              </span>
              {renamingId === zone.id ? (
                <input
                  className="zoneNameInput"
                  type="text"
                  maxLength={32}
                  autoFocus
                  value={zone.name}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onZoneUpdate(zone.id, { name: e.target.value })}
                  onBlur={() => setRenamingId(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "Escape") setRenamingId(null);
                  }}
                />
              ) : (
                <span className="zoneName" title={t("ZONES/RENAME-TT")} onDoubleClick={() => setRenamingId(zone.id)}>
                  {zone.name}
                  {zone.ops.length === 0 ? <em className="zoneEmpty"> ({t("ZONES/EMPTY")})</em> : null}
                </span>
              )}
              <span className="zoneBadges">
                {zone.overrideCorrections ? <span title={t("ZONES/OVERRIDE-CORRECTIONS")}>◐</span> : null}
                {zone.overrideDithering ? <span title={t("ZONES/OVERRIDE-DITHERING")}>▦</span> : null}
              </span>
              <button
                className="zoneMove"
                title={t("ZONES/MOVE-UP")}
                disabled={index === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  onZoneMove(zone.id, index - 1);
                }}
              >
                ▲
              </button>
              <button
                className="zoneMove"
                title={t("ZONES/MOVE-DOWN")}
                disabled={index === zones.length - 1}
                onClick={(e) => {
                  e.stopPropagation();
                  onZoneMove(zone.id, index + 1);
                }}
              >
                ▼
              </button>
              <button
                className="zoneDelete"
                title={t("ZONES/DELETE")}
                onClick={(e) => {
                  e.stopPropagation();
                  onZoneDelete(zone.id);
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedZone === null ? null : (
        <div className="zoneEditor">
          <label className="zoneRow zoneRowName">
            <span>{t("ZONES/NAME")}</span>
            <input type="text" maxLength={32} value={selectedZone.name} onChange={(e) => onZoneUpdate(selectedZone.id, { name: e.target.value })} />
          </label>
          {simpleRect === null ? null : (
            <div className="zoneRect">
              {rectInput("X", "x")}
              {rectInput("Y", "y")}
              {rectInput(t("ZONES/WIDTH"), "w")}
              {rectInput(t("ZONES/HEIGHT"), "h")}
            </div>
          )}

          <label className="zoneOverride">
            <input type="checkbox" checked={selectedZone.overrideCorrections} onChange={(e) => onZoneUpdate(selectedZone.id, { overrideCorrections: e.target.checked })} />
            <b>{t("ZONES/OVERRIDE-CORRECTIONS")}</b>
          </label>
          {selectedZone.overrideCorrections ? (
            <div className="zoneOverrideBody">
              {slider(t("MAP-SETTINGS/PREPROCESSING/BRIGHTNESS"), "brightness", 0, 200)}
              {slider(t("MAP-SETTINGS/PREPROCESSING/CONTRAST"), "contrast", 0, 200)}
              {slider(t("MAP-SETTINGS/PREPROCESSING/SATURATION"), "saturation", 0, 200)}
            </div>
          ) : null}

          <label className="zoneOverride">
            <input type="checkbox" checked={selectedZone.overrideDithering} onChange={(e) => onZoneUpdate(selectedZone.id, { overrideDithering: e.target.checked })} />
            <b>{t("ZONES/OVERRIDE-DITHERING")}</b>
          </label>
          {selectedZone.overrideDithering ? (
            <div className="zoneOverrideBody">
              <label className="zoneRow">
                <span>{t("MAP-SETTINGS/DITHERING/TITLE")}</span>
                <select value={selectedZone.dithering} onChange={(e) => onZoneUpdate(selectedZone.id, { dithering: parseInt(e.target.value) })}>
                  {Object.keys(DitherMethods).map((key) => (
                    <option key={DitherMethods[key].uniqueId} value={DitherMethods[key].uniqueId}>
                      {"localeKey" in DitherMethods[key] ? t(DitherMethods[key].localeKey) : DitherMethods[key].name}
                    </option>
                  ))}
                </select>
              </label>
              {slider(t("MAP-SETTINGS/DITHERING/PROPAGATION-RED"), "ditheringPropagationRed", 0, 200)}
              {slider(t("MAP-SETTINGS/DITHERING/PROPAGATION-GREEN"), "ditheringPropagationGreen", 0, 200)}
              {slider(t("MAP-SETTINGS/DITHERING/PROPAGATION-BLUE"), "ditheringPropagationBlue", 0, 200)}
            </div>
          ) : null}
          <small className="zoneHint">{t("ZONES/OVERLAP-NOTE")}</small>
        </div>
      )}
    </div>
  );
}

export default MapZones;
