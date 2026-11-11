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
  }) {
    this.containerId = containerId;
    this.onPageChange = onPageChange;
    this.storageKey = storageKey;
    this.estimatedRowHeight = estimatedRowHeight;
    this.chromeHeight = chromeHeight;

    this.currentPage = 1;
    this.totalItems = 0;
    this.mode = 'auto'; // 'auto' o número fijo
    this.fixedRows = 15;

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
      if (this.mode === 'auto') {
        this.update(this.totalItems, true);
      }
    };
    window.addEventListener('resize', this._resizeHandler);
  }

  destroy() {
    window.removeEventListener('resize', this._resizeHandler);
  }

  getRowsPerPage() {
    if (this.mode === 'fixed') {
      return this.fixedRows;
    }
    // Modo automático: calcular según la altura disponible de la ventana
    const windowH = window.innerHeight || 800;
    const available = windowH - this.chromeHeight;
    const autoRows = Math.floor(available / this.estimatedRowHeight);
    return Math.max(5, Math.min(autoRows, 60));
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

    if (triggerChange) {
      this.onPageChange(this.currentPage);
    }
  }
}

