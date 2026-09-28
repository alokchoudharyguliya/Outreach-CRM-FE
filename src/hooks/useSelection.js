import { useEffect, useMemo, useState } from "react";

function defaultGetId(item) {
  return item.id;
}

/** Checkbox multi-select helper keyed by item id. */
export function useSelection(items, getId = defaultGetId) {
  const [selected, setSelected] = useState(() => new Set());
  const ids = useMemo(() => items.map(getId), [items, getId]);

  useEffect(() => {
    setSelected((prev) => {
      const next = new Set();
      for (const id of prev) {
        if (ids.includes(id)) next.add(id);
      }
      return next;
    });
  }, [ids]);

  const allSelected = items.length > 0 && selected.size === items.length;
  const someSelected = selected.size > 0 && !allSelected;
  const selectedItems = useMemo(
    () => items.filter((item) => selected.has(getId(item))),
    [items, selected, getId]
  );

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(ids));
  }

  function clear() {
    setSelected(new Set());
  }

  return {
    selected,
    selectedItems,
    allSelected,
    someSelected,
    toggleOne,
    toggleAll,
    clear,
  };
}
