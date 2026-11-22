import React, { useState } from "react";

import "./collapsibleBox.css";

// A titled box with a collapse button. The content stays mounted while collapsed (it is only hidden), so
// components inside keep their state. The collapsed state is remembered in localStorage per box id.
const storageKey = (id) => `mapart.boxCollapsed.${id}`;

function readCollapsed(id, defaultCollapsed) {
  try {
    const stored = window.localStorage.getItem(storageKey(id));
    if (stored === "1") return true;
    if (stored === "0") return false;
  } catch (e) {
    // storage may be unavailable (private mode, blocked): fall back to the default
  }
  return defaultCollapsed;
}

function CollapsibleBox({ id, title, defaultCollapsed = false, children }) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(id, defaultCollapsed));

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey(id), next ? "1" : "0");
      } catch (e) {
        // ignore: the state still works for this session
      }
      return next;
    });
  };

  return (
    <div className={`collapsibleBox ${collapsed ? "collapsed" : ""}`} id={`box-${id}`}>
      <button type="button" className="collapsibleHeader" onClick={toggle} aria-expanded={!collapsed}>
        <span className="collapsibleTitle">{title}</span>
        <span className="collapseIndicator" aria-hidden="true">
          {collapsed ? "▸" : "▾"}
        </span>
      </button>
      <div className="collapsibleBody">{children}</div>
    </div>
  );
}

export default CollapsibleBox;
