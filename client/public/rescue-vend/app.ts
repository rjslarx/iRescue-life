import {
  DEFAULT_INVENTORY,
  getActiveInventory,
  getFallbackSvgDataUri,
  type VendingProduct
} from './inventory.js';
import { VendingSoundEngine } from './audio.js';
import { configureReceiptShare, shareReceipt } from './share';

export interface CartItemPayload {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  quantity: number;
  impactNote?: string;
}

interface DispensedRecord {
  product: VendingProduct;
  quantity: number;
}

class RescueVendApp {
  private inventory: VendingProduct[] = [];
  private cart: Map<string, number> = new Map(); // code -> quantity
  private selectedCode: string | null = null;
  private popoverCode: string | null = null;
  private pendingKeypadLetter: string | null = null;
  private isDispensing: boolean = false;
  private isWaitingForCheckout: boolean = false;
  private lastDispensedItems: DispensedRecord[] = [];
  private sound: VendingSoundEngine;

  // DOM Elements
  private shelvesGrid!: HTMLElement;
  private physicsStage!: HTMLElement;
  private flyingLayer!: HTMLElement;
  private lcdScreen!: HTMLElement;
  private lcdStatusCode!: HTMLElement;
  private lcdCartTotal!: HTMLElement;
  private lcdMainLine!: HTMLElement;
  private lcdSubLine!: HTMLElement;
  private cartStrip!: HTMLElement;
  private cartCountBadge!: HTMLElement;
  private stickyTotalAmount!: HTMLElement;
  private checkoutBtn!: HTMLButtonElement;
  private checkoutBtnText!: HTMLElement;
  private popoverEl!: HTMLElement;
  private deliveryChute!: HTMLElement;
  private chuteDroppedTray!: HTMLElement;
  private collectBadge!: HTMLButtonElement;
  private collectCountPill!: HTMLElement;
  private receiptBackdrop!: HTMLElement;
  private receiptItemsList!: HTMLElement;
  private receiptTotalValue!: HTMLElement;
  private receiptMeta!: HTMLElement;
  private muteBtn!: HTMLButtonElement;
  private muteIcon!: HTMLElement;
  private toastBanner!: HTMLElement;

  constructor(savedCart: Array<{ id: string; quantity: number }> = []) {
    this.sound = new VendingSoundEngine();
    this.inventory = getActiveInventory();
    for (const item of savedCart) {
      const product = this.inventory.find((p) => p.id === item.id);
      if (product && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 10 && Array.from(this.cart.values()).reduce((sum, q) => sum + q, 0) + item.quantity <= 20) {
        this.cart.set(product.code, item.quantity);
      }
    }
    this.bindDomElements();
    this.renderShelves();
    this.renderCart();
    this.updateLcdReadout();
    this.attachEventListeners();
  }

  private bindDomElements(): void {
    this.shelvesGrid = document.getElementById('shelves-grid')!;
    this.physicsStage = document.getElementById('physics-drop-stage')!;
    this.flyingLayer = document.getElementById('flying-clone-layer')!;
    this.lcdScreen = document.getElementById('lcd-screen')!;
    this.lcdStatusCode = document.getElementById('lcd-status-code')!;
    this.lcdCartTotal = document.getElementById('lcd-cart-total')!;
    this.lcdMainLine = document.getElementById('lcd-main-line')!;
    this.lcdSubLine = document.getElementById('lcd-sub-line')!;
    this.cartStrip = document.getElementById('cart-items-strip')!;
    this.cartCountBadge = document.getElementById('cart-count-badge')!;
    this.stickyTotalAmount = document.getElementById('sticky-total-amount')!;
    this.checkoutBtn = document.getElementById('checkout-dispense-btn') as HTMLButtonElement;
    this.checkoutBtnText = document.getElementById('checkout-btn-text')!;
    this.popoverEl = document.getElementById('cart-item-popover')!;
    this.deliveryChute = document.getElementById('delivery-chute')!;
    this.chuteDroppedTray = document.getElementById('chute-dropped-tray')!;
    this.collectBadge = document.getElementById('collect-items-badge') as HTMLButtonElement;
    this.collectCountPill = document.getElementById('collect-count-pill')!;
    this.receiptBackdrop = document.getElementById('receipt-modal-backdrop')!;
    this.receiptItemsList = document.getElementById('receipt-items-list')!;
    this.receiptTotalValue = document.getElementById('receipt-total-value')!;
    this.receiptMeta = document.getElementById('receipt-meta')!;
    this.muteBtn = document.getElementById('mute-toggle-btn') as HTMLButtonElement;
    this.muteIcon = document.getElementById('mute-icon')!;
    this.toastBanner = document.getElementById('toast-banner')!;
  }

  public resetCheckout(): void {
    this.isWaitingForCheckout = false;
    this.renderCart();
    this.updateLcdReadout();
  }

  /**
   * Generates a 3D-style metallic spiral helix SVG for a product slot.
   */
  private createSpiralCoilSvg(code: string): string {
    return `
      <svg class="spiral-coil-svg" data-coil="${code}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="metal-coil-${code}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#f8fafc"/>
            <stop offset="35%" stop-color="#94a3b8"/>
            <stop offset="70%" stop-color="#334155"/>
            <stop offset="100%" stop-color="#cbd5e1"/>
          </linearGradient>
        </defs>
        <!-- Back mounting hub -->
        <circle cx="50" cy="50" r="10" fill="#0f172a" stroke="#475569" stroke-width="2.5"/>
        <!-- Outer helix ring -->
        <circle cx="50" cy="50" r="41" fill="none" stroke="#1e293b" stroke-width="7" opacity="0.8"/>
        <circle cx="50" cy="50" r="41" fill="none" stroke="url(#metal-coil-${code})" stroke-width="4.5" stroke-dasharray="195 25" stroke-linecap="round"/>
        <!-- Middle 3D coil loop -->
        <circle cx="50" cy="50" r="29" fill="none" stroke="#0f172a" stroke-width="6.5" opacity="0.85"/>
        <circle cx="50" cy="50" r="29" fill="none" stroke="url(#metal-coil-${code})" stroke-width="4.2" stroke-dasharray="140 22" stroke-dashoffset="35" stroke-linecap="round"/>
        <!-- Inner helix loop & pusher tip -->
        <circle cx="50" cy="50" r="18" fill="none" stroke="url(#metal-coil-${code})" stroke-width="3.8" stroke-dasharray="85 18" stroke-dashoffset="70" stroke-linecap="round"/>
        <!-- Pusher wire end -->
        <line x1="50" y1="50" x2="50" y2="91" stroke="url(#metal-coil-${code})" stroke-width="4.5" stroke-linecap="round"/>
        <circle cx="50" cy="91" r="3.5" fill="#fde68a" stroke="#0f172a" stroke-width="1.2"/>
      </svg>
    `;
  }

  private formatDollars(cents: number, compactWhole: boolean = false): string {
    const dollars = cents / 100;
    if (compactWhole && cents % 100 === 0) {
      return `$${dollars.toFixed(0)}`;
    }
    return `$${dollars.toFixed(2)}`;
  }

  /**
   * Renders all 8 product slots on the illuminated shelves inside the glass window.
   */
  private renderShelves(): void {
    this.inventory = getActiveInventory();
    this.shelvesGrid.innerHTML = '';

    for (const product of this.inventory) {
      const qty = this.cart.get(product.code) || 0;
      const isSelected = this.selectedCode === product.code || qty > 0;
      const fallbackUri = getFallbackSvgDataUri(product);
      const initialSrc = product.imageUrl || fallbackUri;

      const slotEl = document.createElement('div');
      slotEl.className = `vending-slot${isSelected ? ' selected-slot' : ''}`;
      slotEl.dataset.code = product.code;
      slotEl.setAttribute('role', 'button');
      slotEl.tabIndex = 0;
      slotEl.setAttribute(
        'aria-label',
        `Slot ${product.code}: ${product.name}, ${this.formatDollars(product.priceCents)}. ${product.impactNote}`
      );

      slotEl.innerHTML = `
        <div class="coil-wrapper" aria-hidden="true">
          ${this.createSpiralCoilSvg(product.code)}
        </div>
        ${qty > 0 ? `<span class="slot-qty-badge" aria-label="${qty} in cart">x${qty}</span>` : ''}
        <div class="slot-product-visual" data-visual="${product.code}">
          <div class="slot-product-img-frame" style="border-color: ${product.badgeColor}">
            <img
              class="slot-product-img"
              src="${initialSrc}"
              alt="${product.name}"
              loading="eager"
            />
          </div>
          <span class="slot-product-name">${product.name}</span>
        </div>
        <div class="shelf-price-badge">
          <span class="badge-slot-code">${product.code}</span>
          <span class="badge-dot">•</span>
          <span class="badge-slot-price">${this.formatDollars(product.priceCents, true)}</span>
        </div>
      `;

      const imgEl = slotEl.querySelector('img') as HTMLImageElement;
      imgEl.addEventListener('error', () => {
        if (imgEl.src !== fallbackUri) {
          imgEl.src = fallbackUri;
        }
      });

      slotEl.addEventListener('click', () => {
        if (this.isDispensing) return;
        this.handleProductSelect(product.code, true);
      });
      slotEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.handleProductSelect(product.code, true);
        }
      });

      this.shelvesGrid.appendChild(slotEl);
    }
  }

  /**
   * Selects a product by slot code, increments its quantity in the cart, updates LCD, and flies a mini copy to the cart tray.
   */
  private handleProductSelect(code: string, animateFly: boolean = true): void {
    if (this.isWaitingForCheckout || this.isDispensing) return;
    const normalized = code.toUpperCase().trim();
    const product = this.inventory.find((item) => item.code === normalized);

    if (!product) {
      this.sound.playErrorBeep();
      this.showLcdMessage(`ERR: ${normalized}`, 'INVALID SLOT CODE', 'TRY A1 - D2', true);
      return;
    }

    this.pendingKeypadLetter = null;
    this.selectedCode = product.code;

    const currentQty = this.cart.get(product.code) || 0;
    if (currentQty >= 10 || this.getCartPayload().totalCount >= 20) {
      this.showToast('Limit: 10 of each supply and 20 items per donation.');
      return;
    }
    this.cart.set(product.code, currentQty + 1);

    this.sound.playSelectItem();
    this.refreshShelfSelectionStates();
    this.renderCart();
    this.updateLcdReadout(product);

    if (animateFly) {
      this.animateFlyingCopyToCart(product);
    }
  }

  /**
   * Updates shelf slot badges and neon highlight rings without rebuilding images/coils.
   */
  private refreshShelfSelectionStates(): void {
    const slots = this.shelvesGrid.querySelectorAll<HTMLElement>('.vending-slot');
    slots.forEach((slotEl) => {
      const code = slotEl.dataset.code || '';
      const qty = this.cart.get(code) || 0;
      const isSelected = this.selectedCode === code || qty > 0;
      slotEl.classList.toggle('selected-slot', isSelected);

      let badge = slotEl.querySelector<HTMLElement>('.slot-qty-badge');
      if (qty > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'slot-qty-badge';
          slotEl.appendChild(badge);
        }
        badge.textContent = `x${qty}`;
      } else if (badge) {
        badge.remove();
      }
    });
  }

  /**
   * Animates a mini copy of the selected item flying from its shelf slot down into the sticky cart bar.
   */
  private animateFlyingCopyToCart(product: VendingProduct): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const slotEl = this.shelvesGrid.querySelector<HTMLElement>(`.vending-slot[data-code="${product.code}"]`);
    if (!slotEl) return;

    const slotImg = slotEl.querySelector<HTMLImageElement>('.slot-product-img');
    const startRect = (slotImg || slotEl).getBoundingClientRect();
    const targetRect = this.cartStrip.getBoundingClientRect();

    const flyer = document.createElement('div');
    flyer.className = 'flying-mini-copy';
    flyer.style.left = `${startRect.left + startRect.width / 2 - 22}px`;
    flyer.style.top = `${startRect.top + startRect.height / 2 - 22}px`;
    flyer.style.borderColor = product.badgeColor;

    const img = document.createElement('img');
    img.src = slotImg ? slotImg.src : getFallbackSvgDataUri(product);
    img.alt = '';
    flyer.appendChild(img);

    this.flyingLayer.appendChild(flyer);

    const dx = targetRect.left + Math.min(targetRect.width * 0.5, 140) - (startRect.left + startRect.width / 2);
    const dy = targetRect.top + targetRect.height / 2 - (startRect.top + startRect.height / 2);

    requestAnimationFrame(() => {
      flyer.style.transform = `translate(${dx}px, ${dy}px) scale(0.55) rotate(12deg)`;
      flyer.style.opacity = '0.25';
    });

    window.setTimeout(() => {
      flyer.remove();
    }, 500);
  }

  /**
   * Adjusts item quantity in cart (+1, -1, or remove).
   */
  private adjustCartQuantity(code: string, delta: number): void {
    if (this.isDispensing || this.isWaitingForCheckout) return;
    const product = this.inventory.find((item) => item.code === code);
    if (!product) return;

    const current = this.cart.get(code) || 0;
    const next = current + delta;
    if (delta > 0 && (next > 10 || this.getCartPayload().totalCount >= 20)) {
      this.showToast('Limit: 10 of each supply and 20 items per donation.');
      return;
    }

    if (next <= 0) {
      this.cart.delete(code);
      if (this.popoverCode === code) {
        this.popoverCode = null;
      }
      if (this.selectedCode === code) {
        const remainingKeys = Array.from(this.cart.keys());
        this.selectedCode = remainingKeys.length > 0 ? remainingKeys[remainingKeys.length - 1] : null;
      }
    } else {
      this.cart.set(code, next);
      this.selectedCode = code;
    }

    this.sound.playKeypadBeep(delta > 0 ? 'PLUS' : 'MINUS');
    this.refreshShelfSelectionStates();
    this.renderCart();
    this.renderPopover();

    const focusProduct = this.selectedCode
      ? this.inventory.find((p) => p.code === this.selectedCode)
      : undefined;
    this.updateLcdReadout(focusProduct);
  }

  private removeCartItem(code: string): void {
    const current = this.cart.get(code) || 0;
    if (current > 0) {
      this.adjustCartQuantity(code, -current);
    }
  }

  /**
   * Computes structured cart items payload and total cents.
   */
  public getCartPayload(): { items: CartItemPayload[]; totalCents: number; totalCount: number } {
    const items: CartItemPayload[] = [];
    let totalCents = 0;
    let totalCount = 0;

    for (const [code, quantity] of this.cart.entries()) {
      if (quantity <= 0) continue;
      const product = this.inventory.find((p) => p.code === code);
      if (!product) continue;

      items.push({
        id: product.id,
        code: product.code,
        name: product.name,
        priceCents: product.priceCents,
        quantity
      });
      totalCents += product.priceCents * quantity;
      totalCount += quantity;
    }

    return { items, totalCents, totalCount };
  }

  /**
   * Updates the glowing green/amber digital LCD readout on the side panel.
   */
  private updateLcdReadout(focusedProduct?: VendingProduct): void {
    const { totalCents, totalCount } = this.getCartPayload();
    this.lcdScreen.classList.remove('amber-mode');
    this.lcdCartTotal.textContent = this.formatDollars(totalCents);

    if (this.pendingKeypadLetter) {
      this.lcdStatusCode.textContent = `KEY: ${this.pendingKeypadLetter}_`;
      this.lcdMainLine.textContent = `SELECT ${this.pendingKeypadLetter}1 OR ${this.pendingKeypadLetter}2`;
      this.lcdSubLine.textContent = 'PRESS NUMBER KEY';
      return;
    }

    const activeProduct =
      focusedProduct ||
      (this.selectedCode ? this.inventory.find((p) => p.code === this.selectedCode) : undefined);

    if (activeProduct) {
      const shortName = activeProduct.name.toUpperCase().slice(0, 14);
      const qty = this.cart.get(activeProduct.code) || 0;
      this.lcdStatusCode.textContent = qty > 1 ? `${activeProduct.code} (x${qty})` : activeProduct.code;
      this.lcdMainLine.textContent = `${activeProduct.code}: ${shortName} - ${this.formatDollars(activeProduct.priceCents)}`;
      this.lcdSubLine.textContent = activeProduct.impactNote.toUpperCase();
    } else if (totalCount > 0) {
      this.lcdStatusCode.textContent = `${totalCount} ITEM${totalCount > 1 ? 'S' : ''}`;
      this.lcdMainLine.textContent = `CART TOTAL: ${this.formatDollars(totalCents)}`;
      this.lcdSubLine.textContent = 'READY TO DISPENSE';
    } else {
      this.lcdStatusCode.textContent = 'READY';
      this.lcdMainLine.textContent = 'TAP ITEM OR KEY';
      this.lcdSubLine.textContent = 'SPONSOR SHELTER CARE';
    }
  }

  private showLcdMessage(
    statusCode: string,
    mainLine: string,
    subLine: string,
    amber: boolean = false
  ): void {
    const { totalCents } = this.getCartPayload();
    this.lcdScreen.classList.toggle('amber-mode', amber);
    this.lcdStatusCode.textContent = statusCode;
    this.lcdCartTotal.textContent = this.formatDollars(totalCents);
    this.lcdMainLine.textContent = mainLine;
    this.lcdSubLine.textContent = subLine;
  }

  /**
   * Renders the sticky bottom Donation Tray / Cart Bar.
   */
  private renderCart(): void {
    const { items, totalCents, totalCount } = this.getCartPayload();
    window.parent.postMessage({ type: 'RESCUE_VEND_CART', items }, window.location.origin);

    this.cartCountBadge.textContent = `${totalCount} ${totalCount === 1 ? 'item' : 'items'}`;
    this.stickyTotalAmount.textContent = this.formatDollars(totalCents);

    if (!this.isWaitingForCheckout && !this.isDispensing) {
      this.checkoutBtn.disabled = totalCount === 0;
      this.checkoutBtn.classList.remove('waiting-state');
      this.checkoutBtnText.textContent = 'DONATE & DISPENSE';
    }

    this.cartStrip.innerHTML = '';

    if (items.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'cart-empty-placeholder';
      emptyEl.textContent = 'Tap any supply inside the glass window or punch A1–D2 on the keypad';
      this.cartStrip.appendChild(emptyEl);
      this.popoverCode = null;
      this.renderPopover();
      return;
    }

    for (const entry of items) {
      const product = this.inventory.find((p) => p.code === entry.code)!;
      const fallbackUri = getFallbackSvgDataUri(product);
      const chip = document.createElement('div');
      chip.className = `cart-chip${this.popoverCode === product.code ? ' active-chip' : ''}`;
      chip.setAttribute('role', 'listitem');

      chip.innerHTML = `
        <div class="cart-chip-thumb-wrap" data-open-popover="${product.code}" title="Tap for shelter impact details">
          <img class="cart-chip-thumb" src="${product.imageUrl || fallbackUri}" alt="${product.name}" />
          <span class="cart-chip-qty">x${entry.quantity}</span>
        </div>
        <div class="cart-chip-info">
          <span class="cart-chip-code" data-open-popover="${product.code}">${product.code} • ${this.formatDollars(product.priceCents * entry.quantity, true)}</span>
          <div class="cart-chip-controls">
            <button type="button" class="chip-adj-btn" data-dec="${product.code}" aria-label="Remove one ${product.name}">−</button>
            <button type="button" class="chip-adj-btn" data-inc="${product.code}" aria-label="Add one ${product.name}">+</button>
          </div>
        </div>
      `;

      const thumbImg = chip.querySelector('img') as HTMLImageElement;
      thumbImg.addEventListener('error', () => {
        if (thumbImg.src !== fallbackUri) {
          thumbImg.src = fallbackUri;
        }
      });

      chip.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.dataset.dec) {
          e.stopPropagation();
          this.adjustCartQuantity(product.code, -1);
          return;
        }
        if (target.dataset.inc) {
          e.stopPropagation();
          this.adjustCartQuantity(product.code, 1);
          return;
        }
        this.toggleItemPopover(product.code);
      });

      this.cartStrip.appendChild(chip);
    }
  }

  /**
   * Opens or closes the quick detail popover when tapping an item in the cart bar.
   */
  private toggleItemPopover(code: string): void {
    this.sound.playKeypadBeep('1');
    if (this.popoverCode === code) {
      this.popoverCode = null;
    } else {
      this.popoverCode = code;
      this.selectedCode = code;
    }
    this.renderCart();
    this.renderPopover();
  }

  private renderPopover(): void {
    if (!this.popoverCode) {
      this.popoverEl.classList.add('hidden');
      this.popoverEl.innerHTML = '';
      return;
    }

    const product = this.inventory.find((p) => p.code === this.popoverCode);
    const qty = this.cart.get(this.popoverCode) || 0;

    if (!product || qty <= 0) {
      this.popoverCode = null;
      this.popoverEl.classList.add('hidden');
      return;
    }

    const fallbackUri = getFallbackSvgDataUri(product);
    this.popoverEl.classList.remove('hidden');
    this.popoverEl.innerHTML = `
      <div class="popover-row">
        <img class="popover-thumb" src="${product.imageUrl || fallbackUri}" alt="${product.name}" />
        <div class="popover-text">
          <h3 class="popover-title">${product.code}: ${product.name} (${this.formatDollars(product.priceCents)})</h3>
          <p class="popover-impact">🐾 Impact: ${product.impactNote}</p>
        </div>
        <button type="button" class="popover-close-btn" id="popover-close-btn" aria-label="Close item details">✕</button>
      </div>
      <div class="popover-actions">
        <div class="popover-qty-group">
          <button type="button" class="popover-step-btn" id="popover-dec-btn" aria-label="Decrease quantity">−</button>
          <span class="popover-qty-num">${qty} in cart (${this.formatDollars(product.priceCents * qty)})</span>
          <button type="button" class="popover-step-btn" id="popover-inc-btn" aria-label="Increase quantity">+</button>
        </div>
        <button type="button" class="popover-remove-btn" id="popover-remove-btn">Remove</button>
      </div>
    `;

    const popImg = this.popoverEl.querySelector('img') as HTMLImageElement;
    popImg.addEventListener('error', () => {
      if (popImg.src !== fallbackUri) {
        popImg.src = fallbackUri;
      }
    });

    this.popoverEl.querySelector('#popover-close-btn')?.addEventListener('click', () => {
      this.popoverCode = null;
      this.renderCart();
      this.renderPopover();
    });

    this.popoverEl.querySelector('#popover-dec-btn')?.addEventListener('click', () => {
      this.adjustCartQuantity(product.code, -1);
    });

    this.popoverEl.querySelector('#popover-inc-btn')?.addEventListener('click', () => {
      this.adjustCartQuantity(product.code, 1);
    });

    this.popoverEl.querySelector('#popover-remove-btn')?.addEventListener('click', () => {
      this.removeCartItem(product.code);
    });
  }

  /**
   * Handles tactile 3x4 keypad presses (A-D, 1-4, CLR, +/-, VEND).
   */
  private handleKeypadPress(key: string): void {
    if (this.isDispensing || this.isWaitingForCheckout) return;

    if (['A', 'B', 'C', 'D'].includes(key)) {
      this.sound.playKeypadBeep(key);
      this.pendingKeypadLetter = key;
      this.updateLcdReadout();
      return;
    }

    if (['1', '2', '3', '4'].includes(key)) {
      this.sound.playKeypadBeep(key);
      if (this.pendingKeypadLetter) {
        const fullCode = `${this.pendingKeypadLetter}${key}`;
        this.pendingKeypadLetter = null;
        this.handleProductSelect(fullCode, true);
      } else {
        // Default to row A if user taps a number first
        this.showLcdMessage('KEYPAD', 'PRESS A-D FIRST', 'THEN 1 OR 2', true);
      }
      return;
    }

    if (key === 'CLR') {
      this.sound.playKeypadBeep('CLR');
      this.pendingKeypadLetter = null;
      this.popoverCode = null;
      this.selectedCode = null;
      this.renderPopover();
      this.refreshShelfSelectionStates();
      this.updateLcdReadout();
      return;
    }

    if (key === 'PLUS') {
      const targetCode =
        this.selectedCode ||
        Array.from(this.cart.keys()).pop() ||
        this.inventory[0]?.code;
      if (targetCode) {
        this.handleProductSelect(targetCode, true);
      }
      return;
    }

    if (key === 'MINUS') {
      const targetCode = this.selectedCode || Array.from(this.cart.keys()).pop();
      if (targetCode && (this.cart.get(targetCode) || 0) > 0) {
        this.adjustCartQuantity(targetCode, -1);
      } else {
        this.sound.playErrorBeep();
      }
      return;
    }

    if (key === 'VEND') {
      const { totalCount } = this.getCartPayload();
      if (totalCount > 0) {
        this.initiateCheckout();
      } else {
        this.sound.playErrorBeep();
        this.showLcdMessage('EMPTY', 'CART IS EMPTY', 'SELECT AN ITEM FIRST', true);
      }
    }
  }

  /**
   * 6. Payment Integration Hook:
   * Locks checkout and sends the selection to the validated parent bridge.
   */
  private initiateCheckout(): void {
    if (this.isDispensing || this.isWaitingForCheckout) return;
    const { items, totalCents, totalCount } = this.getCartPayload();
    if (totalCount === 0) return;

    this.sound.playKeypadBeep('A');
    this.popoverCode = null;
    this.renderPopover();

    this.isWaitingForCheckout = true;
    this.checkoutBtn.disabled = true;
    this.checkoutBtn.classList.add('waiting-state');
    this.checkoutBtnText.textContent = 'WAITING FOR CHECKOUT...';
    this.showLcdMessage('CHECKOUT', 'WAITING FOR PAYMENT', `TOTAL: ${this.formatDollars(totalCents)}`, true);

    // The parent owns checkout creation and server payment verification.
    window.parent.postMessage({ type: 'RESCUE_VEND_CHECKOUT', items }, window.location.origin);
  }

  /**
   * Runs the physical dispensing sequence for the provided cart items.
   * Called only by the validated parent bridge with server-confirmed receipt items.
   */
  public async runDispenseSequence(itemsToDispense?: CartItemPayload[]): Promise<void> {
    if (this.isDispensing) return;

    const payload = itemsToDispense && itemsToDispense.length > 0
      ? itemsToDispense
      : this.getCartPayload().items;

    if (payload.length === 0) return;

    this.isDispensing = true;
    this.isWaitingForCheckout = false;
    this.popoverCode = null;
    this.renderPopover();

    this.checkoutBtn.disabled = true;
    this.checkoutBtn.classList.remove('waiting-state');
    this.checkoutBtnText.textContent = 'DISPENSING SUPPLIES...';

    // Clear previous chute items
    this.chuteDroppedTray.innerHTML = '';
    this.collectBadge.classList.add('hidden');
    this.deliveryChute.classList.remove('chute-has-items', 'flap-bounce');

    const dispensedSnapshot: DispensedRecord[] = [];

    for (const item of payload) {
      const illustrated = this.inventory.find((p) => p.id === item.id) || DEFAULT_INVENTORY.find((p) => p.id === item.id);
      // A paid receipt may refer to a supply that is now hidden or renamed.
      const illustration = illustrated || { id: item.id, code: item.code, name: item.name, priceCents: item.priceCents, impactNote: '', badgeColor: '#45a896', imageUrl: '' };
      const product = { ...illustration, ...item, impactNote: item.impactNote ?? illustration.impactNote };

      dispensedSnapshot.push({
        product,
        quantity: item.quantity
      });

      for (let q = 0; q < Math.min(item.quantity, 3); q++) {
        // 1. Flash LCD "VENDING A1..."
        this.showLcdMessage(
          `VEND ${product.code}`,
          `VENDING ${product.code}...`,
          product.name.toUpperCase(),
          true
        );

        // 2. Spin the slot's 3D spiral coil 360° smoothly + 600ms servo whir
        await this.spinCoilAndWhir(product.code, 600);

        // 3. Detach clone of product card, drop with gravity & rotation behind glass into chute
        await this.animateGravityProductDrop(product);

        // 4. Heavy hollow thud-clunk + chute flap bounce + mini item inside chute
        this.sound.playItemDrop();
        this.triggerChuteFlapBounce(product);

        await this.delay(240);
      }
    }

    // Sequence complete!
    this.lastDispensedItems = dispensedSnapshot;
    const totalDispensedCount = dispensedSnapshot.reduce((acc, r) => acc + r.quantity, 0);

    this.sound.playVictoryChime();
    this.showLcdMessage(
      'COMPLETE!',
      'THANK YOU, HERO!',
      'TAP CHUTE TO COLLECT',
      false
    );

    // Clear cart now that items are in the delivery chute
    this.cart.clear();
    this.selectedCode = null;
    this.refreshShelfSelectionStates();
    this.isDispensing = false;
    this.renderCart();

    // Show pulsing "COLLECT ITEMS" badge on the chute
    this.collectCountPill.textContent = `${totalDispensedCount}`;
    this.collectBadge.classList.remove('hidden');
  }

  /**
   * Spins the target slot's 3D spiral coil 360 degrees while playing the 600ms motor servo sound.
   */
  private spinCoilAndWhir(code: string, durationMs: number = 600): Promise<void> {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
    return new Promise((resolve) => {
      const slotEl = this.shelvesGrid.querySelector<HTMLElement>(`.vending-slot[data-code="${code}"]`);
      const coilSvg = this.shelvesGrid.querySelector<SVGElement>(`.spiral-coil-svg[data-coil="${code}"]`);

      if (slotEl) {
        slotEl.classList.add('dispensing-active');
      }

      if (coilSvg) {
        coilSvg.classList.remove('spinning');
        // Force reflow so consecutive spins of the same slot re-trigger cleanly
        void coilSvg.getBoundingClientRect();
        coilSvg.classList.add('spinning');
      }

      this.sound.playCoilMotor(durationMs);

      window.setTimeout(() => {
        if (coilSvg) coilSvg.classList.remove('spinning');
        if (slotEl) slotEl.classList.remove('dispensing-active');
        resolve();
      }, durationMs);
    });
  }

  /**
   * Detaches a product clone from the shelf and animates it falling under gravity with slight rotation behind the glass.
   */
  private animateGravityProductDrop(product: VendingProduct): Promise<void> {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
    return new Promise((resolve) => {
      const stageRect = this.physicsStage.getBoundingClientRect();
      const slotEl = this.shelvesGrid.querySelector<HTMLElement>(`.vending-slot[data-code="${product.code}"]`);
      const slotImg = slotEl?.querySelector<HTMLImageElement>('.slot-product-img');

      const startRect = (slotImg || slotEl || this.shelvesGrid).getBoundingClientRect();
      const startX = startRect.left - stageRect.left + startRect.width / 2 - 28;
      const startY = startRect.top - stageRect.top + startRect.height / 2 - 28;
      const targetY = stageRect.height - 24;
      const targetCenterX = stageRect.width / 2 - 28;

      const clone = document.createElement('div');
      clone.className = 'falling-product-clone';
      clone.style.borderColor = product.badgeColor;

      const img = document.createElement('img');
      img.src = slotImg ? slotImg.src : getFallbackSvgDataUri(product);
      img.alt = product.name;
      clone.appendChild(img);

      this.physicsStage.appendChild(clone);

      // Physics state
      let x = startX;
      let y = startY;
      let vy = -65; // Slight upward pop off the coil lip before gravity pulls down
      const vx = (targetCenterX - startX) * 0.85;
      const gravity = 1950; // px/s^2 acceleration
      let angle = 0;
      const angularVelocity = (Math.random() > 0.5 ? 1 : -1) * (42 + Math.random() * 28); // deg/s

      let lastTime = performance.now();

      const step = (now: number) => {
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;

        vy += gravity * dt;
        y += vy * dt;
        x += vx * dt;
        angle += angularVelocity * dt;

        clone.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${angle}deg)`;

        if (y >= targetY) {
          clone.remove();
          resolve();
        } else {
          requestAnimationFrame(step);
        }
      };

      clone.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(0deg)`;
      requestAnimationFrame(step);
    });
  }

  /**
   * Swings the bottom "PUSH" delivery chute flap open with a bounce and adds the dropped item thumbnail inside.
   */
  private triggerChuteFlapBounce(product: VendingProduct): void {
    this.deliveryChute.classList.remove('flap-bounce');
    void this.deliveryChute.getBoundingClientRect();
    this.deliveryChute.classList.add('flap-bounce', 'chute-has-items');

    const mini = document.createElement('img');
    mini.className = 'chute-mini-item';
    const slotImg = this.shelvesGrid.querySelector<HTMLImageElement>(
      `.vending-slot[data-code="${product.code}"] .slot-product-img`
    );
    mini.src = slotImg ? slotImg.src : getFallbackSvgDataUri(product);
    mini.alt = product.name;
    const tilt = (Math.random() * 18 - 9).toFixed(1);
    mini.style.setProperty('--tilt', `${tilt}deg`);

    // Keep up to 6 visible thumbnails in the chute window
    if (this.chuteDroppedTray.children.length >= 6) {
      this.chuteDroppedTray.removeChild(this.chuteDroppedTray.firstChild!);
    }
    this.chuteDroppedTray.appendChild(mini);
  }

  /**
   * Opens the itemized "Shelter Impact Receipt" modal when the user taps the chute after dispensing.
   */
  private openImpactReceiptModal(): void {
    if (this.lastDispensedItems.length === 0) {
      this.showToast('Dispense an item first to collect your Shelter Impact Receipt!');
      return;
    }

    this.sound.playSelectItem();
    this.receiptItemsList.innerHTML = '';

    let grandTotalCents = 0;
    for (const record of this.lastDispensedItems) {
      const { product, quantity } = record;
      const lineCents = product.priceCents * quantity;
      grandTotalCents += lineCents;

      const fallbackUri = getFallbackSvgDataUri(product);
      const row = document.createElement('div');
      row.className = 'receipt-line-item';
      row.setAttribute('role', 'listitem');
      row.innerHTML = `
        <div class="receipt-line-left">
          <img class="receipt-line-thumb" src="${product.imageUrl || fallbackUri}" alt="${product.name}" />
          <div>
            <div class="receipt-line-name">${quantity}x ${product.name} (${product.code})</div>
            <div class="receipt-line-impact">✓ ${product.impactNote}</div>
          </div>
        </div>
        <div class="receipt-line-price">${this.formatDollars(lineCents)}</div>
      `;

      const rowImg = row.querySelector('img') as HTMLImageElement;
      rowImg.addEventListener('error', () => {
        if (rowImg.src !== fallbackUri) {
          rowImg.src = fallbackUri;
        }
      });

      this.receiptItemsList.appendChild(row);
    }

    this.receiptMeta.textContent = 'PAYMENT VERIFIED • SYMBOLIC DONATION';
    this.receiptTotalValue.textContent = this.formatDollars(grandTotalCents);

    this.receiptBackdrop.classList.remove('hidden');
  }

  private closeImpactReceiptModal(): void {
    this.receiptBackdrop.classList.add('hidden');
    this.collectBadge.classList.add('hidden');
    this.chuteDroppedTray.innerHTML = '';
    this.deliveryChute.classList.remove('chute-has-items', 'flap-bounce');
    this.updateLcdReadout();
  }

  /**
   * Shares the donor's itemized impact using navigator.share with automatic clipboard fallback.
   */
  private async shareDonationReceipt(): Promise<void> {
    await shareReceipt(document.getElementById('share-donation-btn'));
  }

  private showToast(message: string): void {
    this.toastBanner.textContent = message;
    this.toastBanner.classList.remove('hidden');
    window.setTimeout(() => {
      this.toastBanner.classList.add('hidden');
    }, 2800);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms));
  }

  private attachEventListeners(): void {
    // 1. Keypad Buttons
    const keypadGrid = document.getElementById('keypad-grid')!;
    keypadGrid.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.key-btn');
      if (!btn || !btn.dataset.key) return;
      this.handleKeypadPress(btn.dataset.key);
    });

    // 2. Checkout & Dispense Button
    this.checkoutBtn.addEventListener('click', () => {
      this.initiateCheckout();
    });

    // 5. Audio Mute Toggle
    this.muteBtn.addEventListener('click', () => {
      const isMuted = this.sound.toggleMute();
      this.muteBtn.classList.toggle('muted', isMuted);
      this.muteBtn.setAttribute('aria-pressed', String(isMuted));
      this.muteIcon.textContent = isMuted ? 'SOUND OFF' : 'SOUND ON';
    });

    // 6. Delivery Chute & "COLLECT ITEMS" Badge -> Open Shelter Impact Receipt Modal
    this.deliveryChute.addEventListener('click', () => {
      if (this.lastDispensedItems.length > 0 && !this.isDispensing) {
        this.openImpactReceiptModal();
      }
    });

    this.deliveryChute.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && this.lastDispensedItems.length > 0) {
        e.preventDefault();
        this.openImpactReceiptModal();
      }
    });

    // 7. Receipt Modal Actions
    document.getElementById('close-receipt-btn')?.addEventListener('click', () => {
      this.closeImpactReceiptModal();
    });

    document.getElementById('share-donation-btn')?.addEventListener('click', () => {
      this.shareDonationReceipt();
    });

    this.receiptBackdrop.addEventListener('click', (e) => {
      if (e.target === this.receiptBackdrop) {
        this.closeImpactReceiptModal();
      }
    });
  }
}

// Only the same-origin owning frame may initialize or confirm this machine.
let machine: RescueVendApp | null = null;
let dispensed = false;
const escapeText = (text: string) => String(text).replace(/[&<>"']/g, (c) => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]!));
window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin || event.source !== window.parent || window.parent === window) return;
  const data = event.data;
  if (data?.type === 'RESCUE_VEND_INIT' && !machine && Array.isArray(data.items)) {
    configureReceiptShare(data.shareUrl);
    const title = document.querySelector<HTMLElement>('.marquee-title');
    if (title) title.textContent = typeof data.machineTitle === 'string' ? data.machineTitle.slice(0, 80) : 'Rescue Vend';
    window.VENDING_INVENTORY = data.items.filter((p: VendingProduct) => /^[A-D][12]$/.test(p.code) && /^[a-z0-9-]+$/.test(p.id)).map((p: VendingProduct) => ({
      ...p, name: escapeText(p.name), impactNote: escapeText(p.impactNote),
      badgeColor: /^#[0-9a-f]{6}$/i.test(p.badgeColor) ? p.badgeColor : '#45a896',
      imageUrl: getFallbackSvgDataUri(p)
    }));
    machine = new RescueVendApp(Array.isArray(data.cart) ? data.cart : []);
    const shell = document.querySelector<HTMLElement>('.app-shell')!;
    const reportHeight = () => window.parent.postMessage({ type: 'RESCUE_VEND_HEIGHT', height: Math.ceil(shell.getBoundingClientRect().height) + 2 }, window.location.origin);
    new ResizeObserver(reportHeight).observe(shell);
    reportHeight();
    window.parent.postMessage({ type: 'RESCUE_VEND_READY' }, window.location.origin);
  }
  if (data?.type === 'RESCUE_VEND_RESET') machine?.resetCheckout();
  if (data?.type === 'RESCUE_VEND_PAID' && !dispensed && machine && Array.isArray(data.items) && data.items.length) {
    dispensed = true;
    const items = data.items.map((p: CartItemPayload) => ({ ...p, name: escapeText(p.name), impactNote: p.impactNote === undefined ? undefined : escapeText(p.impactNote) }));
    void machine.runDispenseSequence(items);
  }
});
