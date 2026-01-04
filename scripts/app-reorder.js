function initialize_reorder_controls() {
  setup_reorder_list("team_names", {
    item_selector: ".reorder-item",
    handle_selector: ".drag-handle",
    get_expected_order: function (count) {
      return Array.from({ length: count }, function (_, index) {
        return String(index + 1);
      });
    },
    on_reorder: function (order) {
      reorder_teams(order);
    }
  });

  setup_reorder_list("block_names", {
    item_selector: ".reorder-item",
    handle_selector: ".drag-handle",
    get_expected_order: function (count) {
      return Array.from({ length: count }, function (_, index) {
        return String(index + 1);
      });
    },
    on_reorder: function (order) {
      reorder_blocks(order);
    }
  });
}

function setup_reorder_list(container_id, options) {
  var container = document.getElementById(container_id);
  if (!container || container.dataset.reorderInitialized === "true") {
    return;
  }

  container.dataset.reorderInitialized = "true";
  var supports_native_drag = "draggable" in document.createElement("span");
  var dragging_item = null;

  function get_drag_after_element(current_container, y) {
    var draggable_elements = Array.from(
      current_container.querySelectorAll(options.item_selector + ":not(.dragging)")
    );
    return draggable_elements.reduce(function (closest, child) {
      var box = child.getBoundingClientRect();
      var offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      }
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  function finalize_reorder() {
    if (!dragging_item) {
      return;
    }

    dragging_item.classList.remove("dragging");
    dragging_item = null;
    delete container.dataset.dragPointerId;

    var items = Array.from(container.querySelectorAll(options.item_selector));
    var order = items.map(function (item) {
      return item.dataset.index;
    });

    var expected = options.get_expected_order(order.length);
    var is_same = order.every(function (value, index) {
      return value === expected[index];
    });

    if (!is_same) {
      options.on_reorder(order);
      sync_data_to_display();
    }
  }

  container.addEventListener("dragstart", function (event) {
    var handle = event.target.closest(options.handle_selector);
    if (!handle) {
      return;
    }

    dragging_item = handle.closest(options.item_selector);
    if (!dragging_item) {
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", dragging_item.dataset.index || "");
    dragging_item.classList.add("dragging");
  });

  container.addEventListener("dragover", function (event) {
    if (!dragging_item) {
      return;
    }

    event.preventDefault();
    var after_element = get_drag_after_element(container, event.clientY);
    if (after_element == null) {
      container.appendChild(dragging_item);
    } else {
      container.insertBefore(dragging_item, after_element);
    }
  });

  container.addEventListener("drop", function (event) {
    if (!dragging_item) {
      return;
    }
    event.preventDefault();
    finalize_reorder();
  });

  container.addEventListener("dragend", function () {
    if (!dragging_item) {
      return;
    }
    dragging_item.classList.remove("dragging");
    dragging_item = null;
  });

  container.addEventListener("pointerdown", function (event) {
    var handle = event.target.closest(options.handle_selector);
    if (!handle) {
      return;
    }
    if (supports_native_drag && event.pointerType === "mouse") {
      return;
    }

    var item = handle.closest(options.item_selector);
    if (!item) {
      return;
    }

    event.preventDefault();
    dragging_item = item;
    dragging_item.classList.add("dragging");
    handle.setPointerCapture(event.pointerId);
    container.dataset.dragPointerId = String(event.pointerId);
  });

  container.addEventListener("pointermove", function (event) {
    if (!dragging_item) {
      return;
    }
    if (supports_native_drag && event.pointerType === "mouse") {
      return;
    }
    if (container.dataset.dragPointerId !== String(event.pointerId)) {
      return;
    }

    var after_element = get_drag_after_element(container, event.clientY);
    if (after_element == null) {
      container.appendChild(dragging_item);
    } else {
      container.insertBefore(dragging_item, after_element);
    }
  });

  container.addEventListener("pointerup", function (event) {
    if (supports_native_drag && event.pointerType === "mouse") {
      return;
    }
    finalize_reorder();
  });

  container.addEventListener("pointercancel", function (event) {
    if (supports_native_drag && event.pointerType === "mouse") {
      return;
    }
    finalize_reorder();
  });
}
