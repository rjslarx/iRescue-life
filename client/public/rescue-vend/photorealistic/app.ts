import {
  getActiveSupplyCatalog,
  toSupply,
  type RescueSupplyItem,
  type CartItem
} from './catalog.js';
import { VendingSoundEngine } from './audio.js';

const escapeHtml = (value: string) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

class RescueSupplyVendorApp {
  private catalog: RescueSupplyItem[] = [];
  private cart: Map<string, CartItem> = new Map();
  private lastDispensedItems: CartItem[] = [];
  private activeSlotCode: string | null = null;
  private keypadLetterBuffer: string | null = null;
  private isWaitingForPayment: boolean = false;
  private isDispensing: boolean = false;
  private hasUncollectedReceipt: boolean = false;
  private sound: VendingSoundEngine = new VendingSoundEngine();

  // DOM References
  private shelvesChamber!: HTMLElement;
  private dropChamberLayer!: HTMLElement;
  private ledIndicatorDot!: HTMLElement;
  private ledCodeBadge!: HTMLElement;
  private ledMatrixText!: HTMLElement;
  private ledImpactSubtext!: HTMLElement;
  private contactlessReader!: HTMLElement;
  private chuteTarget!: HTMLElement;
  private chuteFlap!: HTMLElement;
  private chuteReceiptPrompt!: HTMLElement;
  private trayBadgeCount!: HTMLElement;
  private trayImpactPreview!: HTMLElement;
  private trayItemsList!: HTMLElement;
  private quickPayBtn!: HTMLButtonElement;
  private quickPayBtnText!: HTMLElement;
  private muteToggleBtn!: HTMLButtonElement;
  private muteIcon!: HTMLElement;
  private muteLabel!: HTMLElement;

  // Receipt Modal DOM
  private receiptModalBackdrop!: HTMLElement;
  private receiptMeta!: HTMLElement;
  private receiptItemsList!: HTMLElement;
  private receiptTotalAmount!: HTMLElement;
  private shareGiftBtn!: HTMLButtonElement;
  private shareGiftBtnText!: HTMLElement;
  private closeReceiptBtn!: HTMLButtonElement;
  private receiptFocus: HTMLElement | null = null;

  constructor(savedCart: Array<{ id: string; quantity: number }> = []) {
    this.catalog = getActiveSupplyCatalog();
    for (const line of savedCart) {
      const item = this.catalog.find(entry => entry.id === line?.id);
      if (item && !this.cart.has(item.id) && Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity <= 10 && this.getTotalCount() + line.quantity <= 20) {
        this.cart.set(item.id, { ...item, quantity: line.quantity });
      }
    }
    this.bindElements();
    this.renderShelves();
    this.renderCartTray();
    this.bindEvents();
  }

  private bindElements(): void {
    this.shelvesChamber = document.getElementById('shelves-chamber') as HTMLElement;
    this.dropChamberLayer = document.getElementById('drop-chamber-layer') as HTMLElement;
    this.ledIndicatorDot = document.getElementById('led-indicator-dot') as HTMLElement;
    this.ledCodeBadge = document.getElementById('led-code-badge') as HTMLElement;
    this.ledMatrixText = document.getElementById('led-matrix-text') as HTMLElement;
    this.ledImpactSubtext = document.getElementById('led-impact-subtext') as HTMLElement;
    this.contactlessReader = document.getElementById('contactless-reader') as HTMLElement;
    this.chuteTarget = document.getElementById('delivery-chute-target') as HTMLElement;
    this.chuteFlap = document.getElementById('chute-flap') as HTMLElement;
    this.chuteReceiptPrompt = document.getElementById('chute-receipt-prompt') as HTMLElement;
    this.trayBadgeCount = document.getElementById('tray-badge-count') as HTMLElement;
    this.trayImpactPreview = document.getElementById('tray-impact-preview') as HTMLElement;
    this.trayItemsList = document.getElementById('tray-items-list') as HTMLElement;
    this.quickPayBtn = document.getElementById('quick-pay-btn') as HTMLButtonElement;
    this.quickPayBtnText = document.getElementById('quick-pay-btn-text') as HTMLElement;
    this.muteToggleBtn = document.getElementById('mute-toggle-btn') as HTMLButtonElement;
    this.muteIcon = document.getElementById('mute-icon') as HTMLElement;
    this.muteLabel = document.getElementById('mute-label') as HTMLElement;

    this.receiptModalBackdrop = document.getElementById('receipt-modal-backdrop') as HTMLElement;
    this.receiptMeta = document.getElementById('receipt-meta') as HTMLElement;
    this.receiptItemsList = document.getElementById('receipt-items-list') as HTMLElement;
    this.receiptTotalAmount = document.getElementById('receipt-total-amount') as HTMLElement;
    this.shareGiftBtn = document.getElementById('share-gift-btn') as HTMLButtonElement;
    this.shareGiftBtnText = document.getElementById('share-gift-btn-text') as HTMLElement;
    this.closeReceiptBtn = document.getElementById('close-receipt-btn') as HTMLButtonElement;
  }

  /**
   * Generates a fallback SVG data URI so standing packages always look crisp even offline
   */
  private createFallbackPackageSvg(item: RescueSupplyItem): string {
    const palette: Record<string, [string, string]> = {
      A1: ['#991b1b', '#dc2626'],
      A2: ['#b45309', '#f59e0b'],
      B1: ['#be123c', '#f43f5e'],
      B2: ['#a16207', '#eab308'],
      C1: ['#1d4ed8', '#3b82f6'],
      C2: ['#047857', '#10b981']
    };
    const [c1, c2] = palette[item.code] || ['#374151', '#6b7280'];
    const safeBrand = item.brand.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const safeCode = item.code.replace(/&/g, '&amp;');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${c2}"/>
          <stop offset="100%" stop-color="${c1}"/>
        </linearGradient>
      </defs>
      <rect width="160" height="160" fill="url(#g)"/>
      <circle cx="80" cy="64" r="34" fill="rgba(255,255,255,0.16)"/>
      <text x="80" y="72" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-weight="900" font-size="24">${safeCode}</text>
      <text x="80" y="112" text-anchor="middle" fill="rgba(255,255,255,0.9)" font-family="sans-serif" font-weight="700" font-size="12">${safeBrand}</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  /**
   * Renders the 3 recessed shelves with metallic spiral coils, standing 3D packages, and price tag clips
   */
  private renderShelves(): void {
    this.catalog = getActiveSupplyCatalog();
    this.shelvesChamber.innerHTML = '';

    // Group items in pairs of 2 per shelf row (A1-A2, B1-B2, C1-C2)
    const rows: RescueSupplyItem[][] = [];
    for (let i = 0; i < this.catalog.length; i += 2) {
      rows.push(this.catalog.slice(i, i + 2));
    }

    rows.forEach((rowItems, rowIndex) => {
      const shelfRow = document.createElement('div');
      shelfRow.className = 'shelf-row';
      shelfRow.setAttribute('data-row-index', String(rowIndex));

      const slotsGrid = document.createElement('div');
      slotsGrid.className = 'shelf-slots-grid';

      rowItems.forEach((item) => {
        const slot = document.createElement('div');
        slot.className = 'vending-slot';
        slot.setAttribute('data-code', item.code);
        slot.setAttribute('role', 'button');
        slot.setAttribute('tabindex', '0');
        slot.setAttribute(
          'aria-label',
          `${item.code}: ${item.brand} ${item.name}, ${item.priceDisplay}. ${item.impactNote}`
        );

        const fallbackSrc = this.createFallbackPackageSvg(item);

        slot.innerHTML = `
          <div class="slot-back-shadow" aria-hidden="true"></div>
          <div class="slot-shelf-floor" aria-hidden="true"></div>
          <span class="slot-qty-badge" data-qty-badge="${item.code}">0</span>

          <!-- Metallic Silver Spiral Vending Coil -->
          <div class="coil-assembly" aria-hidden="true">
            <svg class="coil-svg" viewBox="0 0 100 56" fill="none">
              <defs>
                <linearGradient id="coil-metal-${item.code}" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#ffffff" />
                  <stop offset="28%" stop-color="#9ca3af" />
                  <stop offset="65%" stop-color="#f3f4f6" />
                  <stop offset="100%" stop-color="#1f2937" />
                </linearGradient>
              </defs>
              <!-- Rear Auger Motor Hub -->
              <circle cx="50" cy="16" r="6" fill="#1f2937" stroke="#4b5563" stroke-width="1.5" />
              <!-- Back Auger Helix Rings -->
              <ellipse cx="50" cy="18" rx="22" ry="8" stroke="#4b5563" stroke-width="3.2" />
              <ellipse cx="50" cy="25" rx="28" ry="10.5" stroke="#6b7280" stroke-width="3.6" />
              <ellipse cx="50" cy="33" rx="34" ry="12.5" stroke="url(#coil-metal-${item.code})" stroke-width="4.2" />
              <!-- Front Auger Specular Helix Ring & Pigtail Tip -->
              <path d="M 14 36 C 14 22, 86 22, 86 36 C 86 49, 20 50, 25 39" stroke="url(#coil-metal-${item.code})" stroke-width="4.6" stroke-linecap="round" />
              <circle cx="25" cy="39" r="3" fill="#ffffff" />
            </svg>
          </div>

          <!-- Standing 3D Product Package -->
          <div class="product-stage">
            <div class="product-package-3d" data-package="${item.code}">
              <img
                class="package-photo"
                src="${escapeHtml(item.imageUrl)}"
                alt="${escapeHtml(item.name)}"
                loading="eager"
              />
              <div class="package-label-overlay">
                <span class="package-brand-tag">${escapeHtml(item.brand)}</span>
                <span class="package-item-title">${escapeHtml(item.name)}</span>
              </div>
            </div>
          </div>

          <!-- Metallic Coil Base Retainer Loop -->
          <div class="coil-front-retainer" aria-hidden="true"></div>

          <!-- Dark Shelf Lip with Authentic Physical Price Tag Clip -->
          <div class="shelf-lip-rail">
            <div class="price-tag-clip">
              <span class="clip-code">${item.code}</span>
              <span class="clip-divider">|</span>
              <span class="clip-price">${item.priceDisplay}</span>
            </div>
          </div>
        `;

        const imgEl = slot.querySelector('.package-photo') as HTMLImageElement | null;
        if (imgEl) {
          imgEl.addEventListener('error', () => {
            if (imgEl.src !== fallbackSrc) {
              imgEl.src = fallbackSrc;
            }
          });
        }

        slot.addEventListener('click', () => {
          this.handleItemSelect(item.code, 'shelf');
        });

        slot.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.handleItemSelect(item.code, 'shelf');
          }
        });

        slotsGrid.appendChild(slot);
      });

      shelfRow.appendChild(slotsGrid);
      this.shelvesChamber.appendChild(shelfRow);
    });

    this.syncSlotHighlightsAndBadges();
  }

  private bindEvents(): void {
    // Unlock Web Audio on first pointer interaction anywhere
    const unlockOnce = () => {
      this.sound.unlock();
      window.removeEventListener('pointerdown', unlockOnce);
    };
    window.addEventListener('pointerdown', unlockOnce, { passive: true });

    // Keypad Buttons (A-C, 1-2, CLR)
    const keypadButtons = document.querySelectorAll<HTMLButtonElement>('.keypad-btn');
    keypadButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-key');
        if (key) {
          this.handleKeypadPress(key, btn);
        }
      });
    });

    // Mute Toggle Button
    this.muteToggleBtn.addEventListener('click', () => {
      const muted = this.sound.toggleMute();
      this.muteToggleBtn.setAttribute('aria-pressed', String(muted));
      this.muteIcon.textContent = muted ? 'Sound off' : 'Sound on';
      this.muteLabel.textContent = muted ? 'Sound Muted' : 'Sound On';
    });

    // Primary Quick-Pay & Dispense Button
    this.quickPayBtn.addEventListener('click', () => {
      this.triggerQuickPay();
    });

    // Delivery Chute Tap -> Open Shelter Impact Receipt Modal
    const handleChuteActivate = () => {
      if (this.hasUncollectedReceipt || this.lastDispensedItems.length > 0) {
        this.sound.playTapTone(1040);
        this.openReceiptModal();
      } else {
        this.sound.playTapTone(620);
        this.chuteFlap.classList.remove('is-bouncing');
        void this.chuteFlap.offsetWidth;
        this.chuteFlap.classList.add('is-bouncing');
      }
    };

    this.chuteTarget.addEventListener('click', handleChuteActivate);
    this.chuteTarget.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleChuteActivate();
      }
    });

    // Receipt Modal Buttons
    this.closeReceiptBtn.addEventListener('click', () => {
      this.sound.playTapTone(880);
      this.closeReceiptModal();
    });

    this.receiptModalBackdrop.addEventListener('click', (e: MouseEvent) => {
      if (e.target === this.receiptModalBackdrop) {
        this.closeReceiptModal();
      }
    });

    this.shareGiftBtn.addEventListener('click', () => {
      this.handleShareGift();
    });

    document.addEventListener('keydown', event => {
      if (this.receiptModalBackdrop.hidden) return;
      if (event.key === 'Escape') this.closeReceiptModal();
      if (event.key === 'Tab') {
        const first = this.shareGiftBtn;
        const last = this.closeReceiptBtn;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
  }

  /**
   * Handles physical keypad presses (A, B, C, 1, 2, CLR)
   */
  private handleKeypadPress(key: string, btnEl: HTMLButtonElement): void {
    if (this.isDispensing || this.isWaitingForPayment) return;

    btnEl.classList.add('is-pressed');
    setTimeout(() => btnEl.classList.remove('is-pressed'), 120);

    const allLetterBtns = document.querySelectorAll<HTMLButtonElement>('.keypad-btn.letter-key');

    if (key === 'CLR') {
      this.sound.playTapTone(640);
      this.keypadLetterBuffer = null;
      this.activeSlotCode = null;
      allLetterBtns.forEach((b) => b.classList.remove('active-buffer'));
      this.updateLedDisplay('SELECT ITEM...', 'Tap any shelf item or enter code', 'READY');
      this.syncSlotHighlightsAndBadges();
      return;
    }

    if (key === 'A' || key === 'B' || key === 'C' || key === 'D') {
      this.sound.playTapTone(980);
      this.keypadLetterBuffer = key;
      allLetterBtns.forEach((b) => {
        b.classList.toggle('active-buffer', b.getAttribute('data-key') === key);
      });
      this.updateLedDisplay(`${key}_ : ENTER 1 OR 2`, 'Press 1 or 2 to complete slot code', `ROW ${key}`);
      return;
    }

    if (key === '1' || key === '2') {
      const rowLetter = this.keypadLetterBuffer || (this.activeSlotCode ? this.activeSlotCode.charAt(0) : 'A');
      const fullCode = `${rowLetter}${key}`;
      allLetterBtns.forEach((b) => b.classList.remove('active-buffer'));
      this.keypadLetterBuffer = null;
      this.handleItemSelect(fullCode, 'keypad');
    }
  }

  /**
   * Selects an item by slot code, illuminates its border, updates LED display, and adds to Donation Tray
   */
  private handleItemSelect(code: string, source: 'shelf' | 'keypad'): void {
    if (this.isDispensing || this.isWaitingForPayment) return;

    const normalizedCode = code.toUpperCase().trim();
    const item = this.catalog.find((i) => i.code === normalizedCode);

    if (!item) {
      this.sound.playTapTone(420);
      this.updateLedDisplay(`INVALID: ${normalizedCode}`, 'Choose an available supply, A1–D2', 'ERR');
      return;
    }

    // Crisp mechanical click + tone
    this.sound.playTapTone(source === 'keypad' ? 1220 : 1080);

    this.activeSlotCode = item.code;

    // Add or increment in cart
    const existing = this.cart.get(item.id);
    if ((existing?.quantity ?? 0) >= 10 || this.getTotalCount() >= 20) {
      this.updateLedDisplay('SELECTION LIMIT', 'Up to 10 of each supply and 20 items total', 'LIMIT');
      return;
    }
    if (existing) {
      existing.quantity += 1;
    } else {
      this.cart.set(item.id, {
        id: item.id,
        code: item.code,
        brand: item.brand,
        name: item.name,
        priceCents: item.priceCents,
        priceDisplay: item.priceDisplay,
        impactNote: item.impactNote,
        imageUrl: item.imageUrl,
        quantity: 1
      });
    }

    // Update dot-matrix LED display: "A1: PUP-PERONI - $12" and impactNote
    const ledMain = `${item.code}: ${item.brand.toUpperCase()} - ${item.priceDisplay}`;
    this.updateLedDisplay(ledMain, item.impactNote, `SLOT ${item.code}`);

    this.syncSlotHighlightsAndBadges();
    this.renderCartTray();
  }

  /**
   * Adjusts item quantity (+ / -) inside the sticky Donation Tray
   */
  private adjustCartQuantity(itemId: string, delta: number): void {
    if (this.isDispensing || this.isWaitingForPayment) return;

    const entry = this.cart.get(itemId);
    if (!entry) return;
    if (delta > 0 && (entry.quantity >= 10 || this.getTotalCount() >= 20)) {
      this.updateLedDisplay('SELECTION LIMIT', 'Up to 10 of each supply and 20 items total', 'LIMIT');
      return;
    }

    this.sound.playTapTone(delta > 0 ? 1160 : 820);

    entry.quantity += delta;
    if (entry.quantity <= 0) {
      this.cart.delete(itemId);
      if (this.activeSlotCode === entry.code) {
        const remaining = this.getCartItemsArray();
        const fallback = remaining[remaining.length - 1];
        if (fallback) {
          this.activeSlotCode = fallback.code;
          this.updateLedDisplay(
            `${fallback.code}: ${fallback.brand.toUpperCase()} - ${fallback.priceDisplay}`,
            fallback.impactNote,
            `SLOT ${fallback.code}`
          );
        } else {
          this.activeSlotCode = null;
          this.updateLedDisplay('SELECT ITEM...', 'Tap any shelf item or enter code', 'READY');
        }
      }
    } else {
      this.activeSlotCode = entry.code;
      this.updateLedDisplay(
        `${entry.code}: ${entry.brand.toUpperCase()} - ${entry.priceDisplay}`,
        entry.impactNote,
        `QTY ×${entry.quantity}`
      );
    }

    this.syncSlotHighlightsAndBadges();
    this.renderCartTray();
  }

  private updateLedDisplay(mainText: string, subText: string, badgeText: string, flashing: boolean = false): void {
    this.ledMatrixText.textContent = mainText;
    this.ledImpactSubtext.textContent = subText;
    this.ledCodeBadge.textContent = badgeText;
    this.ledMatrixText.classList.toggle('is-flashing', flashing);
    this.ledIndicatorDot.classList.toggle('vending', flashing);
  }

  private syncSlotHighlightsAndBadges(): void {
    const slots = this.shelvesChamber.querySelectorAll<HTMLElement>('.vending-slot');
    slots.forEach((slot) => {
      const code = slot.getAttribute('data-code') || '';
      const cartItem = Array.from(this.cart.values()).find((c) => c.code === code);
      const qty = cartItem ? cartItem.quantity : 0;

      slot.classList.toggle('is-selected', code === this.activeSlotCode || qty > 0);

      const badge = slot.querySelector<HTMLElement>(`[data-qty-badge="${code}"]`);
      if (badge) {
        badge.textContent = `×${qty}`;
        badge.classList.toggle('visible', qty > 0);
      }
    });
  }

  private getCartItemsArray(): CartItem[] {
    return Array.from(this.cart.values());
  }

  private getTotalCents(items: CartItem[] = this.getCartItemsArray()): number {
    return items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  }

  private getTotalCount(items: CartItem[] = this.getCartItemsArray()): number {
    return items.reduce((sum, item) => sum + item.quantity, 0);
  }

  private formatDollars(cents: number): string {
    const dollars = cents / 100;
    return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
  }

  /**
   * Renders the sticky bottom Donation Tray
   */
  private renderCartTray(): void {
    const items = this.getCartItemsArray();
    const totalCount = this.getTotalCount(items);
    const totalCents = this.getTotalCents(items);
    const formattedTotal = this.formatDollars(totalCents);
    window.parent.postMessage({ type: 'RESCUE_VEND_CART', items: items.map(({ id, quantity }) => ({ id, quantity })) }, window.location.origin);

    this.trayBadgeCount.textContent = String(totalCount);

    // Update impact preview line in tray header
    const activeItem = items.find((i) => i.code === this.activeSlotCode) || items[items.length - 1];
    if (activeItem) {
      this.trayImpactPreview.textContent = `★ ${activeItem.impactNote}`;
    } else {
      this.trayImpactPreview.textContent = 'Tap a product on the shelf to sponsor shelter care';
    }

    // Render item pills
    this.trayItemsList.innerHTML = '';
    if (items.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'tray-empty-placeholder';
      emptyEl.textContent = 'No supplies selected yet — tap A1–D2 above to fill the tray.';
      this.trayItemsList.appendChild(emptyEl);
    } else {
      items.forEach((item) => {
        const pill = document.createElement('div');
        pill.className = 'tray-item-pill';
        pill.setAttribute('role', 'listitem');

        pill.innerHTML = `
          <div class="tray-item-info">
            <div class="tray-item-top">
              <span class="tray-item-code">${item.code}</span>
              <span class="tray-item-name">${escapeHtml(item.name)}</span>
            </div>
            <span class="tray-item-sub">${item.priceDisplay} each</span>
          </div>
          <div class="tray-qty-controls">
            <button type="button" class="qty-adj-btn" data-action="dec" aria-label="Decrease quantity of ${escapeHtml(item.name)}">−</button>
            <span class="tray-qty-value">${item.quantity}</span>
            <button type="button" class="qty-adj-btn" data-action="inc" aria-label="Increase quantity of ${escapeHtml(item.name)}">+</button>
          </div>
        `;

        const decBtn = pill.querySelector('[data-action="dec"]') as HTMLButtonElement;
        const incBtn = pill.querySelector('[data-action="inc"]') as HTMLButtonElement;

        decBtn.addEventListener('click', () => this.adjustCartQuantity(item.id, -1));
        incBtn.addEventListener('click', () => this.adjustCartQuantity(item.id, 1));

        this.trayItemsList.appendChild(pill);
      });
    }

    // Update primary Quick-Pay & Dispense button state
    if (this.isDispensing) {
      this.quickPayBtn.disabled = true;
      this.quickPayBtn.classList.remove('is-waiting');
      this.quickPayBtnText.textContent = 'DISPENSING SUPPLIES...';
    } else if (this.isWaitingForPayment) {
      this.quickPayBtn.disabled = true;
      this.quickPayBtn.classList.add('is-waiting');
      this.quickPayBtnText.textContent = 'WAITING FOR PAYMENT...';
    } else if (totalCount === 0) {
      this.quickPayBtn.disabled = true;
      this.quickPayBtn.classList.remove('is-waiting');
      this.quickPayBtnText.textContent = 'SELECT ITEMS TO SPONSOR ($0)';
    } else {
      this.quickPayBtn.disabled = false;
      this.quickPayBtn.classList.remove('is-waiting');
      this.quickPayBtnText.textContent = `DONATE & DISPENSE (${formattedTotal})`;
    }
  }

  /**
   * The owning page creates checkout and verifies payment on the server.
   */
  private triggerQuickPay(): void {
    if (this.isDispensing || this.isWaitingForPayment) return;
    const cartItems = this.getCartItemsArray();
    if (cartItems.length === 0) return;

    this.sound.playTapTone(1320);
    this.isWaitingForPayment = true;
    this.contactlessReader.classList.add('is-waiting');

    const totalAmountCents = this.getTotalCents(cartItems);
    this.updateLedDisplay(
      `DONATE ${this.formatDollars(totalAmountCents)}`,
      'Opening secure Stripe checkout...',
      'CHECKOUT',
      true
    );
    this.renderCartTray();

    window.parent.postMessage({ type: 'RESCUE_VEND_CHECKOUT', items: cartItems.map(({ id, quantity }) => ({ id, quantity })) }, window.location.origin);
  }

  /**
   * Only the owning page can reset checkout.
   */
  public resetPaymentWaitingState(statusMessage: string = 'SELECT ITEM...'): void {
    if (this.isDispensing) return;
    this.isWaitingForPayment = false;
    this.contactlessReader.classList.remove('is-waiting');

    const items = this.getCartItemsArray();
    const last = items[items.length - 1];
    if (last) {
      this.updateLedDisplay(
        `${last.code}: ${last.brand.toUpperCase()} - ${last.priceDisplay}`,
        last.impactNote,
        statusMessage,
        false
      );
    } else {
      this.updateLedDisplay(statusMessage, 'Tap any shelf item or enter code', 'READY', false);
    }
    this.renderCartTray();
  }

  /**
   * 4. Sequential Coil Rotation & Drop Physics Animation
   */
  public async runDispenseSequence(cartItems: CartItem[]): Promise<void> {
    if (this.isDispensing || cartItems.length === 0) return;

    this.isWaitingForPayment = false;
    this.isDispensing = true;
    this.hasUncollectedReceipt = false;
    this.chuteReceiptPrompt.hidden = true;
    this.contactlessReader.classList.remove('is-waiting');

    // Deep copy dispensed items for the Shelter Impact Receipt
    this.lastDispensedItems = cartItems.map((item) => ({ ...item }));
    this.renderCartTray();

    // Expand quantities so each physical unit vends sequentially
    const vendQueue: CartItem[] = [];
    for (const item of cartItems) {
      for (let q = 0; q < item.quantity; q++) {
        vendQueue.push(item);
      }
    }

    for (let i = 0; i < vendQueue.length; i++) {
      const unit = vendQueue[i];
      await this.dispenseSingleUnit(unit);
      if (i < vendQueue.length - 1) {
        await this.delay(240);
      }
    }

    // Dispense sequence completed!
    this.sound.playCompletionChime();
    this.isDispensing = false;
    this.hasUncollectedReceipt = true;
    this.cart.clear();
    this.activeSlotCode = null;
    this.syncSlotHighlightsAndBadges();
    this.renderCartTray();

    // Show glowing "TAP CHUTE TO COLLECT RECEIPT" prompt
    this.chuteReceiptPrompt.hidden = false;
    this.updateLedDisplay(
      'THANK YOU! COLLECT BELOW',
      'Tap the delivery chute for your Shelter Impact Receipt',
      'COMPLETE',
      false
    );
  }

  /**
   * Animates a single unit's 360-deg coil rotation, package forward tip & gravity drop, and chute flap bounce
   */
  private async dispenseSingleUnit(item: CartItem): Promise<void> {
    // 1. LED display flashes "VENDING A1..."
    this.updateLedDisplay(`VENDING ${item.code}...`, item.impactNote, 'DISPENSE', true);

    const slotEl = this.shelvesChamber.querySelector<HTMLElement>(`.vending-slot[data-code="${item.code}"]`);
    const packageEl = slotEl?.querySelector<HTMLElement>(`[data-package="${item.code}"]`);

    if (!slotEl || !packageEl) {
      await this.delay(750);
      return;
    }

    slotEl.classList.add('is-vending', 'is-spinning-coil');

    // 2. Play 750ms low-pitched electric auger/gear whir while coil rotates 360 degrees
    this.sound.playCoilMotor(750);

    // Wait slightly as the auger pushes the product forward before tipping over the lip
    await this.delay(220);

    // 3. Create falling 3D package clone positioned over the slot inside the glass chamber
    const chamberRect = this.dropChamberLayer.getBoundingClientRect();
    const pkgRect = packageEl.getBoundingClientRect();

    const startLeft = pkgRect.left - chamberRect.left;
    const startTop = pkgRect.top - chamberRect.top;
    const dropDistancePx = Math.max(180, chamberRect.height - startTop + 25);

    const clone = packageEl.cloneNode(true) as HTMLElement;
    clone.className = 'product-package-3d falling-package-clone';
    clone.style.left = `${startLeft}px`;
    clone.style.top = `${startTop}px`;
    clone.style.setProperty('--drop-distance', `${dropDistancePx}px`);

    // Dim original slot package briefly while the front package drops
    packageEl.style.opacity = '0.32';
    this.dropChamberLayer.appendChild(clone);

    // Wait until the falling package hits the delivery chute (~760ms into the 980ms drop)
    await this.delay(740);

    // 4. Chute impact sound + "PUSH" flap bounces outward slightly
    this.sound.playChuteImpact();
    this.chuteFlap.classList.remove('is-bouncing');
    void this.chuteFlap.offsetWidth;
    this.chuteFlap.classList.add('is-bouncing');

    await this.delay(280);

    // Cleanup slot animation state and restore next package in slot
    slotEl.classList.remove('is-vending', 'is-spinning-coil');
    packageEl.style.opacity = '1';
    clone.remove();
  }

  /**
   * Opens the itemized Shelter Impact Receipt Modal
   */
  private openReceiptModal(): void {
    const items = this.lastDispensedItems;
    if (items.length === 0) return;

    this.hasUncollectedReceipt = false;
    this.chuteReceiptPrompt.hidden = true;

    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    this.receiptMeta.textContent = `DISPENSED AT ${nowStr} • SYMBOLIC DONATION`;

    this.receiptItemsList.innerHTML = '';
    items.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'receipt-line-item';
      const lineTotal = this.formatDollars(item.priceCents * item.quantity);

      li.innerHTML = `
        <div class="receipt-line-left">
          <span class="receipt-line-title">${item.quantity}× [${item.code}] ${escapeHtml(item.name)}</span>
          <span class="receipt-line-impact">${escapeHtml(item.impactNote)}</span>
        </div>
        <span class="receipt-line-price">${lineTotal}</span>
      `;
      this.receiptItemsList.appendChild(li);
    });

    const totalCents = this.getTotalCents(items);
    this.receiptTotalAmount.textContent = this.formatDollars(totalCents);
    this.shareGiftBtnText.textContent = 'Share My Gift';
    this.receiptModalBackdrop.hidden = false;
    this.receiptFocus = document.activeElement as HTMLElement | null;
    document.querySelector<HTMLElement>('.app-shell')?.setAttribute('inert', '');
    this.closeReceiptBtn.focus();
  }

  private closeReceiptModal(): void {
    this.receiptModalBackdrop.hidden = true;
    document.querySelector<HTMLElement>('.app-shell')?.removeAttribute('inert');
    this.receiptFocus?.focus();
    this.updateLedDisplay('SELECT ITEM...', 'Tap any shelf item or enter code', 'READY', false);
  }

  /**
   * Shares the donor's sponsored shelter supplies via navigator.share with clipboard fallback
   */
  private async handleShareGift(): Promise<void> {
    window.parent.postMessage({ type: 'RESCUE_VEND_SHARE' }, window.location.origin);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms));
  }
}

let machine: RescueSupplyVendorApp | null = null;
let dispensed = false;
window.addEventListener('message', event => {
  if (event.origin !== window.location.origin || event.source !== window.parent || window.parent === window) return;
  const data = event.data;
  if (data?.type === 'RESCUE_VEND_INIT' && !machine && Array.isArray(data.items)) {
    window.RESCUE_VENDING_ITEMS = data.items
      .filter((item: RescueSupplyItem) => item && /^[A-D][12]$/.test(item.code) && /^[a-z0-9-]+$/.test(item.id) && typeof item.name === 'string' && Number.isInteger(item.priceCents) && item.priceCents >= 100)
      .map(toSupply);
    const title = typeof data.machineTitle === 'string' ? data.machineTitle.slice(0, 80) : 'Rescue Vend';
    document.querySelector<HTMLElement>('.marquee-title')!.textContent = title;
    document.getElementById('machine-utility-title')!.textContent = title;
    machine = new RescueSupplyVendorApp(Array.isArray(data.cart) ? data.cart : []);
    const shell = document.querySelector<HTMLElement>('.app-shell')!;
    const reportHeight = () => window.parent.postMessage({ type: 'RESCUE_VEND_HEIGHT', height: Math.ceil(shell.getBoundingClientRect().height) + 2 }, window.location.origin);
    new ResizeObserver(reportHeight).observe(shell);
    reportHeight();
    window.parent.postMessage({ type: 'RESCUE_VEND_READY' }, window.location.origin);
  }
  if (data?.type === 'RESCUE_VEND_RESET') machine?.resetPaymentWaitingState();
  if (data?.type === 'RESCUE_VEND_PAID' && !dispensed && machine && Array.isArray(data.items) && data.items.length) {
    // Receipt snapshots remain authoritative even if a slot is now hidden or renamed.
    const items = data.items.filter((item: CartItem) => item && /^[A-D][12]$/.test(item.code) && typeof item.name === 'string' && Number.isInteger(item.priceCents) && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 10)
      .map((item: CartItem) => ({ ...toSupply(item), quantity: item.quantity }));
    if (!items.length || items.reduce((sum: number, item: CartItem) => sum + item.quantity, 0) > 20) return;
    dispensed = true;
    void machine.runDispenseSequence(items);
  }
});
