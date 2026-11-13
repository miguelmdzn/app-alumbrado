/**
 * ============================================================================
 * TABLE PAGINATION HELPER — Alumbrado Público (table-pagination.js)
 * ============================================================================
 * Maneja la paginación de tablas con cálculo automático de filas por página
 * según la altura visible del viewport para evitar scrolls verticales innecesarios.
 * ============================================================================
 */

export class TablePaginator {
  constructor({
    containerId = 'tablePagination',
    onPageChange = () => {},
    storageKey = null,
    estimatedRowHeight = 44,
    chromeHeight = 310,
    overflowAllowance = 0,
  }) {
    this.containerId = containerId;
    this.onPageChange = onPageChange;
    this.storageKey = storageKey;
    this.estimatedRowHeight = estimatedRowHeight;
    this.chromeHeight = chromeHeight;
    this.overflowAllowance = overflowAllowance;

    this.currentPage = 1;
    this.totalItems = 0;
    this.mode = 'auto'; // 'auto' o número fijo
    this.fixedRows = 15;
    this._fittedRows = null;
    this._appliedRows = null;
    this._viewportCap = null;
    this._rowHeight = 0;
    this._fitCeiling = null;
    this._measuredBodyId = null;
    this._overflowPasses = 0;
    this._fitting = false;

    if (this.storageKey) {
      try {
        const saved = localStorage.getItem(this.storageKey);
        if (saved) {
          if (saved === 'auto') {
            this.mode = 'auto';
          } else {
            const num = parseInt(saved, 10);
            if (!isNaN(num) && num > 0) {
              this.mode = 'fixed';
              this.fixedRows = num;
            }
          }
        }
      } catch {
        // Ignore storage errors
      }
    }

    // Escuchar redimensionamiento de ventana para recalcular en modo auto
    this._resizeHandler = () => {
      if (this.mode !== 'auto') return;
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => {
        this._fittedRows = null;
        this._appliedRows = null;
        this._viewportCap = null;
        this._rowHeight = 0;
        this._fitCeiling = null;
        this._measuredBodyId = null;
        this.update(this.totalItems, true);
      }, 120);
    };
    window.addEventListener('resize', this._resizeHandler);
  }

  destroy() {
    clearTimeout(this._resizeTimer);
    window.removeEventListener('resize', this._resizeHandler);
  }

  fallbackRows() {
    const windowH = window.innerHeight || 800;
    const available = windowH - this.chromeHeight;
    const autoRows = Math.floor(available / this.estimatedRowHeight);
    return Math.max(1, Math.min(autoRows, 60));
  }

  getRowsPerPage() {
    if (this._appliedRows) return this._appliedRows;
    if (this.mode === 'fixed') return this.fixedRows;
    return this.fallbackRows();
  }

  /** Distancia desde el borde superior del documento, independiente del scroll. */
  pageOffsetTop(el) {
    let top = 0;
    let node = el;
    while (node && node !== document.body && node !== document.documentElement) {
      top += node.offsetTop || 0;
      const parent = node.offsetParent;
      if (parent && parent !== document.body && parent !== document.documentElement) {
        top += parent.clientTop || 0;
      }
      node = parent;
    }
    return top;
  }

  findTable() {
    const pag = document.getElementById(this.containerId);
    const scope = pag?.closest('.records-container-card')
      || document.querySelector('.app-main-content')
      || document;
    const tables = scope.querySelectorAll('table.records-table');
    for (const table of tables) {
      if (table.closest('.print-only')) continue;
      if (table.offsetParent === null) continue;
      return table;
    }
    return null;
  }

  measureRowHeight(table) {
    const rows = [...(table.tBodies[0]?.rows || [])].filter((row) => {
      if (row.classList.contains('table-empty-row')) return false;
      const cell = row.cells[0];
      if (row.cells.length === 1 && cell && cell.colSpan > 1) return false;
      return row.getBoundingClientRect().height > 0;
    });
    if (!rows.length) return this.estimatedRowHeight;
    const heights = rows
      .map((row) => row.getBoundingClientRect().height)
      .filter((h) => h > 0)
      .sort((a, b) => a - b);
    if (!heights.length) return this.estimatedRowHeight;
    const mid = heights[Math.floor((heights.length - 1) / 2)];
    return Math.max(this.estimatedRowHeight, Math.ceil(mid));
  }

  spaceBelowTable(table) {
    const pag = document.getElementById(this.containerId);
    const pagH = pag && pag.offsetHeight >= 8 ? pag.offsetHeight : 54;
    let below = pagH + 8;

    const wrap = table.closest('.table-responsive');
    if (wrap && wrap.scrollWidth > wrap.clientWidth + 1) {
      below += Math.max(0, wrap.offsetHeight - wrap.clientHeight);
    }

    const card = table.closest('.records-container-card');
    if (card) {
      const cs = getComputedStyle(card);
      below += parseFloat(cs.paddingBottom) || 0;
      below += parseFloat(cs.borderBottomWidth) || 0;
      below += parseFloat(cs.marginBottom) || 0;
    }

    const container = table.closest('.app-container');
    if (container) {
      below += parseFloat(getComputedStyle(container).paddingBottom) || 0;
    }
    return below;
  }

  /**
   * Cuántas filas caben entre el encabezado de la tabla y el borde inferior
   * de la ventana, dejando sitio a la paginación y al padding de la página.
   */
  computeFittedRows() {
    const table = this.findTable();
    if (!table) return null;

    const bodyId = table.tBodies[0]?.id || '';
    if (bodyId !== this._measuredBodyId) {
      this._rowHeight = 0;
      this._fitCeiling = null;
      this._appliedRows = null;
      this._measuredBodyId = bodyId;
    }

    const rowH = this.measureRowHeight(table);
    this._rowHeight = rowH;

    const theadH = table.tHead?.offsetHeight || this.estimatedRowHeight;
    const tableTop = this.pageOffsetTop(table);
    const budget = window.innerHeight - tableTop - theadH - this.spaceBelowTable(table) + this.overflowAllowance;
    if (budget <= 0) return 1;

    let rows = Math.floor(budget / this._rowHeight);
    rows = Math.max(1, Math.min(rows, 80));
    if (this._fitCeiling && rows > this._fitCeiling) return this._fitCeiling;
    return rows;
  }

  overflowAmount() {
    const pag = document.getElementById(this.containerId);
    if (!pag || pag.offsetHeight < 8) return 0;

    let bottom = this.pageOffsetTop(pag) + pag.offsetHeight;
    const card = pag.closest('.records-container-card');
    if (card) {
      const cs = getComputedStyle(card);
      bottom += parseFloat(cs.paddingBottom) || 0;
      bottom += parseFloat(cs.borderBottomWidth) || 0;
      bottom += parseFloat(cs.marginBottom) || 0;
    }
    const container = pag.closest('.app-container');
    if (container) {
      bottom += parseFloat(getComputedStyle(container).paddingBottom) || 0;
    }
    return bottom - window.innerHeight;
  }

  refit() {
    this._fitting = true;
    try {
      this.onPageChange(this.currentPage);
    } finally {
      this._fitting = false;
    }
  }

  getTotalPages() {
    const rpp = this.getRowsPerPage();
    return Math.max(1, Math.ceil(this.totalItems / rpp));
  }

  getCurrentSlice(items) {
    this.totalItems = items.length;
    const rpp = this.getRowsPerPage();
    const totalPages = this.getTotalPages();

    if (this.currentPage > totalPages) {
      this.currentPage = totalPages;
    }
    if (this.currentPage < 1) {
      this.currentPage = 1;
    }

    const start = (this.currentPage - 1) * rpp;
    const end = start + rpp;
    return items.slice(start, end);
  }

  resetPage() {
    this.currentPage = 1;
  }

  update(total, triggerChange = false) {
    this.totalItems = total;

    if (!this._fitting) {
      const fitted = this.computeFittedRows();
      if (fitted) this._viewportCap = fitted;
      let target = this.mode === 'fixed'
        ? Math.min(this.fixedRows, this._viewportCap || this.fixedRows)
        : (this._viewportCap || this.fallbackRows());
      if (this._fitCeiling) target = Math.min(target, this._fitCeiling);
      target = Math.max(1, target);
      if (target !== this._appliedRows) {
        this._appliedRows = target;
        this._fittedRows = target;
        const totalPages = this.getTotalPages();
        if (this.currentPage > totalPages) this.currentPage = totalPages;
        if (this.currentPage < 1) this.currentPage = 1;
        this.refit();
        return;
      }
    }

    const container = document.getElementById(this.containerId);
    if (!container) return;

    const rpp = this.getRowsPerPage();
    const totalPages = this.getTotalPages();

    if (this.currentPage > totalPages) {
      this.currentPage = totalPages;
    }
    if (this.currentPage < 1) {
      this.currentPage = 1;
    }

    const start = total === 0 ? 0 : (this.currentPage - 1) * rpp + 1;
    const end = Math.min(this.currentPage * rpp, total);

    // Generar botones de páginas compactos
    let pageButtonsHtml = '';
    const maxButtons = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    if (endPage - startPage + 1 < maxButtons) {
      startPage = Math.max(1, endPage - maxButtons + 1);
    }

    if (startPage > 1) {
      pageButtonsHtml += `<button type="button" class="pagination-btn pagination-num" data-page="1">1</button>`;
      if (startPage > 2) {
        pageButtonsHtml += `<span class="pagination-ellipsis">…</span>`;
      }
    }

    for (let p = startPage; p <= endPage; p++) {
      const activeClass = p === this.currentPage ? 'active' : '';
      pageButtonsHtml += `<button type="button" class="pagination-btn pagination-num ${activeClass}" data-page="${p}">${p}</button>`;
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        pageButtonsHtml += `<span class="pagination-ellipsis">…</span>`;
      }
      pageButtonsHtml += `<button type="button" class="pagination-btn pagination-num" data-page="${totalPages}">${totalPages}</button>`;
    }

    container.innerHTML = `
      <div class="pagination-info">
        Mostrando <strong>${start}–${end}</strong> de <strong>${total}</strong> registros
      </div>

      <div class="pagination-controls">
        <label class="pagination-auto-select-label" title="Filas visibles por página">
          <span>Mostrar:</span>
          <select class="pagination-rows-select" id="${this.containerId}_selectRows">
            <option value="auto" ${this.mode === 'auto' ? 'selected' : ''}>Auto (${rpp})</option>
            <option value="10" ${this.mode === 'fixed' && this.fixedRows === 10 ? 'selected' : ''}>10</option>
            <option value="15" ${this.mode === 'fixed' && this.fixedRows === 15 ? 'selected' : ''}>15</option>
            <option value="25" ${this.mode === 'fixed' && this.fixedRows === 25 ? 'selected' : ''}>25</option>
            <option value="50" ${this.mode === 'fixed' && this.fixedRows === 50 ? 'selected' : ''}>50</option>
          </select>
        </label>

        <button type="button" class="pagination-btn pagination-nav" id="${this.containerId}_prev" ${this.currentPage <= 1 ? 'disabled' : ''} title="Página anterior">
          ‹ Anterior
        </button>

        <div class="pagination-pages-group">
          ${pageButtonsHtml}
        </div>

        <button type="button" class="pagination-btn pagination-nav" id="${this.containerId}_next" ${this.currentPage >= totalPages ? 'disabled' : ''} title="Página siguiente">
          Siguiente ›
        </button>
      </div>
    `;

    // Eventos
    const select = document.getElementById(`${this.containerId}_selectRows`);
    if (select) {
      select.onchange = (e) => {
        const val = e.target.value;
        if (val === 'auto') {
          this.mode = 'auto';
        } else {
          this.mode = 'fixed';
          this.fixedRows = parseInt(val, 10);
        }
        if (this.storageKey) {
          try {
            localStorage.setItem(this.storageKey, val);
          } catch {}
        }
        this.currentPage = 1;
        this._fittedRows = null;
        this._appliedRows = null;
        this._viewportCap = null;
        this._rowHeight = 0;
        this._fitCeiling = null;
        this._measuredBodyId = null;
        this.onPageChange(this.currentPage);
      };
    }

    const prevBtn = document.getElementById(`${this.containerId}_prev`);
    if (prevBtn) {
      prevBtn.onclick = () => {
        if (this.currentPage > 1) {
          this.currentPage--;
          this.onPageChange(this.currentPage);
        }
      };
    }

    const nextBtn = document.getElementById(`${this.containerId}_next`);
    if (nextBtn) {
      nextBtn.onclick = () => {
        if (this.currentPage < totalPages) {
          this.currentPage++;
          this.onPageChange(this.currentPage);
        }
      };
    }

    container.querySelectorAll('.pagination-num').forEach((btn) => {
      btn.onclick = () => {
        const page = parseInt(btn.dataset.page, 10);
        if (!isNaN(page) && page !== this.currentPage) {
          this.currentPage = page;
          this.onPageChange(this.currentPage);
        }
      };
    });

    if (this.mode === 'auto' && this._overflowPasses < 3) {
      const overflow = this.overflowAmount();
      if (overflow > this.overflowAllowance + 2 && rpp > 1) {
        const fittedNow = this.computeFittedRows();
        let next = fittedNow && fittedNow < rpp ? fittedNow : null;
        if (next == null) {
          const rowH = Math.max(this._rowHeight || this.estimatedRowHeight, 1);
          const extra = overflow - this.overflowAllowance;
          const drop = Math.max(1, Math.ceil(extra / rowH));
          next = Math.max(1, rpp - drop);
        }
        if (next < rpp) {
          this._fittedRows = next;
          this._appliedRows = next;
          this._fitCeiling = next;
          this._overflowPasses += 1;
          const pages = this.getTotalPages();
          if (this.currentPage > pages) this.currentPage = pages;
          this.refit();
          return;
        }
      }
    }
    this._overflowPasses = 0;

    if (triggerChange) {
      this.onPageChange(this.currentPage);
    }
  }
}

