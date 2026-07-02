// ==========================================================================
// AETHER FRONTEND APPLICATION ENGINE
// ==========================================================================

// Global App State
const state = {
  products: [],
  cart: { items: [], totalPrice: 0 },
  user: null,
  token: localStorage.getItem('aether_token') || null,
  currentProduct: null,
  deliveryAddress: localStorage.getItem('aether_delivery_address') || '',
  deliveryPincode: localStorage.getItem('aether_delivery_pincode') || '',
  filters: {
    category: 'all',
    search: '',
    sort: ''
  }
};

// ==========================================================================
// API FETCH UTILITY
// ==========================================================================
async function apiRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(state.token && { 'Authorization': `Bearer ${state.token}` }),
    ...options.headers
  };

  const response = await fetch(endpoint, {
    ...options,
    headers
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Something went wrong');
  }

  return data;
}

// ==========================================================================
// TOAST NOTIFICATIONS
// ==========================================================================
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  // Custom SVG icon based on type
  const icon = type === 'success' 
    ? '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="none" d="M0 0h24v24H0z"/><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-.997-6l7.07-7.071-1.414-1.414-5.656 5.657-2.829-2.829-1.414 1.414L11.003 16z" fill="currentColor"/></svg>'
    : '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="none" d="M0 0h24v24H0z"/><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z" fill="currentColor"/></svg>';
  
  toast.innerHTML = `${icon} <span>${message}</span>`;
  container.appendChild(toast);

  // Fade out and remove
  setTimeout(() => {
    toast.classList.add('toast-fade-out');
    toast.addEventListener('transitionend', () => toast.remove());
  }, 4000);
}

// ==========================================================================
// USER AUTHENTICATION & SESSION MANAGEMENT
// ==========================================================================
async function initAuth() {
  if (!state.token) {
    updateAuthUI();
    return;
  }

  try {
    const userProfile = await apiRequest('/api/auth/profile');
    state.user = userProfile;
    await syncCart();
  } catch (error) {
    console.error('Session expired:', error.message);
    logout();
  } finally {
    updateAuthUI();
  }
}

function updateAuthUI() {
  const authNav = document.getElementById('auth-nav-container');
  const navOrders = document.getElementById('nav-orders');
  const navAdmin = document.getElementById('nav-admin');
  
  if (state.user) {
    navOrders.classList.remove('hidden');
    if (state.user.isAdmin) {
      navAdmin.classList.remove('hidden');
    } else {
      navAdmin.classList.add('hidden');
    }
    authNav.innerHTML = `
      <div class="nav-user-info">
        <span class="nav-username">Hello, ${state.user.name.split(' ')[0]}</span>
        <button id="logout-btn" class="btn btn-secondary btn-sm">Logout</button>
      </div>
    `;
    document.getElementById('logout-btn').addEventListener('click', logout);
  } else {
    navOrders.classList.add('hidden');
    navAdmin.classList.add('hidden');
    authNav.innerHTML = `<button id="login-nav-btn" class="btn btn-secondary">Login</button>`;
    document.getElementById('login-nav-btn').addEventListener('click', openAuthModal);
  }
}

async function login(email, password) {
  try {
    const data = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('aether_token', data.token);
    
    showToast(`Welcome back, ${data.user.name}!`);
    closeAuthModal();
    updateAuthUI();
    
    // Sync cart and refresh UI
    await syncCart();
    fetchProducts(); 
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function signup(name, email, password, otp) {
  try {
    const data = await apiRequest('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, otp })
    });

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('aether_token', data.token);

    showToast(`Account created! Welcome, ${data.user.name}.`);
    closeAuthModal();
    updateAuthUI();
    
    await syncCart();
    fetchProducts();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function sendOtp(email) {
  const sendBtn = document.getElementById('signup-send-otp-btn');
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending OTP...';

  try {
    const res = await apiRequest('/api/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ email })
    });

    showToast(res.message || 'OTP verification code sent successfully!');
    
    // Unhide verification input field & submit button
    document.getElementById('signup-otp-group').classList.remove('hidden');
    document.getElementById('signup-submit-btn').classList.remove('hidden');
    sendBtn.classList.add('hidden');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send Verification OTP';
  }
}

function showForgotPasswordForm() {
  document.getElementById('tab-login').classList.remove('active');
  document.getElementById('tab-signup').classList.remove('active');
  document.getElementById('login-form').classList.remove('active-form');
  document.getElementById('signup-form').classList.remove('active-form');
  
  const forgotForm = document.getElementById('forgot-password-form');
  forgotForm.classList.add('active-form');
  
  forgotForm.reset();
  document.getElementById('forgot-email-step').classList.remove('hidden');
  document.getElementById('forgot-reset-step').classList.add('hidden');
}

async function sendForgotOtp(email) {
  const sendBtn = document.getElementById('forgot-send-otp-btn');
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending OTP...';

  try {
    const res = await apiRequest('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    });

    showToast(res.message || 'OTP verification code sent successfully!');
    document.getElementById('forgot-email-step').classList.add('hidden');
    document.getElementById('forgot-reset-step').classList.remove('hidden');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send Reset OTP';
  }
}

async function resetPassword(email, otp, newPassword) {
  try {
    const data = await apiRequest('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, otp, newPassword })
    });

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('aether_token', data.token);

    showToast(data.message || 'Password reset successfully!');
    closeAuthModal();
    updateAuthUI();
    
    await syncCart();
    fetchProducts();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ==========================================================================
// GOOGLE SIGN-IN HANDLERS
// ==========================================================================
function initGoogleSignIn() {
  if (typeof google === 'undefined') {
    // If the library hasn't loaded yet, wait and try again
    setTimeout(initGoogleSignIn, 100);
    return;
  }

  google.accounts.id.initialize({
    client_id: '343304830383-24ol8p9pp01ndnl33gr31h2848n9o4p2.apps.googleusercontent.com',
    callback: handleGoogleLogin
  });

  google.accounts.id.renderButton(
    document.getElementById('google-signin-btn'),
    { 
      theme: 'outline', 
      size: 'large', 
      width: '320', // Width matches the auth modal size
      text: 'signin_with',
      shape: 'pill'
    }
  );
}

async function handleGoogleLogin(googleResponse) {
  try {
    const data = await apiRequest('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken: googleResponse.credential })
    });

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('aether_token', data.token);

    showToast(`Welcome, ${data.user.name}!`);
    closeAuthModal();
    updateAuthUI();
    
    // Sync cart and refresh UI
    await syncCart();
    fetchProducts(); 
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function logout() {
  state.token = null;
  state.user = null;
  state.cart = { items: [], totalPrice: 0 };
  localStorage.removeItem('aether_token');
  
  // Clear delivery address details on logout
  state.deliveryAddress = '';
  state.deliveryPincode = '';
  localStorage.removeItem('aether_delivery_address');
  localStorage.removeItem('aether_delivery_pincode');
  document.getElementById('header-location-text').textContent = 'Add Address';
  document.getElementById('modal-address-input').value = '';
  document.getElementById('modal-pincode-input').value = '';

  showToast('Logged out successfully');
  updateAuthUI();
  updateCartBadge();
  switchSection('shop-section');
  fetchProducts();
}

// ==========================================================================
// PRODUCT CATALOG LOGIC
// ==========================================================================
async function fetchProducts() {
  const grid = document.getElementById('products-grid');
  grid.innerHTML = '<div class="cart-empty-message">Loading catalog items...</div>';

  try {
    const params = new URLSearchParams();
    if (state.filters.category && state.filters.category !== 'all') {
      params.append('category', state.filters.category);
    }
    if (state.filters.search) {
      params.append('q', state.filters.search);
    }
    if (state.filters.sort) {
      params.append('sort', state.filters.sort);
    }

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    state.products = await apiRequest(`/api/products${queryStr}`);
    renderProducts();
  } catch (error) {
    grid.innerHTML = `<div class="cart-empty-message" style="color: #ef4444;">Failed to load catalog: ${error.message}</div>`;
  }
}

function renderProducts() {
  const grid = document.getElementById('products-grid');
  grid.innerHTML = '';

  if (state.products.length === 0) {
    grid.innerHTML = '<div class="cart-empty-message">No items found matching your filters.</div>';
    return;
  }

  state.products.forEach(product => {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.style.cursor = 'pointer';

    // Stock tag coloring
    let stockClass = 'in-stock';
    let stockText = `${product.stock} in stock`;
    if (product.stock === 0) {
      stockClass = 'out-of-stock';
      stockText = 'Out of Stock';
    } else if (product.stock <= 5) {
      stockClass = 'low-stock';
      stockText = `Only ${product.stock} left!`;
    }

    card.innerHTML = `
      <div class="product-image-container">
        <img class="product-image" src="${product.imageUrl}" alt="${product.name}" loading="lazy">
        <span class="product-category">${product.category}</span>
      </div>
      <div class="product-details">
        <h3 class="product-title">${product.name}</h3>
        <p class="product-desc">${product.description}</p>
        <span class="stock-tag ${stockClass}">${stockText}</span>
        <div class="product-footer">
          <span class="product-price">₹${product.price.toFixed(2)}</span>
          <button class="btn btn-primary add-to-cart-btn" data-id="${product.id}" ${product.stock === 0 ? 'disabled' : ''}>
            ${product.stock === 0 ? 'Sold Out' : 'Add to Bag'}
          </button>
        </div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.add-to-cart-btn')) {
        return; // Clicked add to cart button inside card
      }
      openProductDetails(product.id);
    });

    grid.appendChild(card);
  });

  // Attach cart listeners
  document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const productId = e.target.getAttribute('data-id');
      handleAddToCart(productId);
    });
  });
}

// ==========================================================================
// PRODUCT DETAIL VIEW LOGIC
// ==========================================================================
async function openProductDetails(productId) {
  try {
    const product = await apiRequest(`/api/products/${productId}`);
    state.currentProduct = product;

    // Set text elements
    document.getElementById('detail-image').src = product.imageUrl;
    document.getElementById('detail-image').alt = product.name;
    document.getElementById('detail-category').textContent = product.category;
    document.getElementById('detail-title').textContent = product.name;
    document.getElementById('detail-desc').textContent = product.description;
    document.getElementById('detail-price').textContent = `₹${product.price.toFixed(2)}`;

    // Stock label color & text
    const stockTag = document.getElementById('detail-stock-tag');
    stockTag.className = 'stock-tag'; // reset classes
    const addBtn = document.getElementById('detail-add-btn');
    addBtn.disabled = false;
    addBtn.textContent = 'Add to Bag';

    if (product.stock === 0) {
      stockTag.classList.add('out-of-stock');
      stockTag.textContent = 'Out of Stock';
      addBtn.disabled = true;
      addBtn.textContent = 'Sold Out';
    } else if (product.stock <= 5) {
      stockTag.classList.add('low-stock');
      stockTag.textContent = `Only ${product.stock} left!`;
    } else {
      stockTag.classList.add('in-stock');
      stockTag.textContent = `${product.stock} in stock`;
    }

    // Reset Quantity field
    const qtyInput = document.getElementById('detail-quantity');
    qtyInput.value = '1';

    // Auto-fill Pincode Checker if saved in address section
    const pinField = document.getElementById('detail-pincode-input');
    const pinStatus = document.getElementById('detail-pincode-status');
    if (state.deliveryPincode) {
      pinField.value = state.deliveryPincode;
      checkPincodeAvailability(state.deliveryPincode);
    } else {
      pinField.value = '';
      pinStatus.style.display = 'none';
    }

    // Related products grid
    renderRelatedProducts(product);

    // Switch section
    switchSection('product-detail-section');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    showToast(`Error loading product: ${error.message}`, 'error');
  }
}

async function checkPincodeAvailability(pincode) {
  const statusDiv = document.getElementById('detail-pincode-status');
  if (!pincode) {
    statusDiv.style.display = 'none';
    return;
  }

  if (!/^\d{6}$/.test(pincode)) {
    statusDiv.style.display = 'flex';
    statusDiv.style.color = '#ef4444'; // Red
    statusDiv.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" style="color: #ef4444; flex-shrink: 0;"><path fill="none" d="M0 0h24v24H0z"/><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z" fill="currentColor"/></svg>
      <span>Please enter a valid 6-digit Pincode.</span>
    `;
    return;
  }

  // Show checking loader with spin animation
  statusDiv.style.display = 'flex';
  statusDiv.style.color = 'var(--text-gray)';
  statusDiv.innerHTML = `
    <span style="border: 2px solid rgba(255,255,255,0.1); border-top: 2px solid var(--accent-cyan); border-radius: 50%; width: 14px; height: 14px; display: inline-block; animation: spin 1s linear infinite; margin-right: 6px; flex-shrink: 0;"></span>
    <span>Checking availability...</span>
  `;

  // Local lookup fallback map
  const PINCODE_MAP_FALLBACK = {
    '394230': 'Surat, Gujarat',
    '395007': 'Surat, Gujarat',
    '395001': 'Surat, Gujarat',
    '395003': 'Surat, Gujarat',
    '110001': 'New Delhi, Delhi',
    '110002': 'Delhi, Delhi',
    '400001': 'Mumbai, Maharashtra',
    '400002': 'Mumbai, Maharashtra',
    '560001': 'Bengaluru, Karnataka',
    '600001': 'Chennai, Tamil Nadu',
    '700001': 'Kolkata, West Bengal',
    '500001': 'Hyderabad, Telangana',
    '380001': 'Ahmedabad, Gujarat',
    '390001': 'Vadodara, Gujarat',
    '302001': 'Jaipur, Rajasthan',
    '122001': 'Gurugram, Haryana',
    '201301': 'Noida, Uttar Pradesh'
  };

  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
    const data = await res.json();

    if (data && data[0] && data[0].Status === 'Success' && data[0].PostOffice) {
      const postOffice = data[0].PostOffice[0];
      const district = postOffice.District;
      const stateName = postOffice.State;
      const location = `${district}, ${stateName}`;
      const days = (parseInt(pincode[5]) % 3) + 2; 

      statusDiv.style.display = 'flex';
      statusDiv.style.color = '#22c55e'; // Green
      statusDiv.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" style="color: #22c55e; flex-shrink: 0;"><path fill="none" d="M0 0h24v24H0z"/><path d="M10 15.172l9.192-9.193 1.415 1.414L10 18l-6.364-6.364 1.414-1.414z" fill="currentColor"/></svg>
        <span>Delivery available to <strong>${location}</strong>. Estimated arrival in ${days} days.</span>
      `;
    } else {
      statusDiv.style.display = 'flex';
      statusDiv.style.color = '#ef4444'; // Red
      statusDiv.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" style="color: #ef4444; flex-shrink: 0;"><path fill="none" d="M0 0h24v24H0z"/><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z" fill="currentColor"/></svg>
        <span>Delivery unavailable to this pincode.</span>
      `;
    }
  } catch (err) {
    console.warn('Postal Pincode API failed, falling back to local database:', err.message);
    const location = PINCODE_MAP_FALLBACK[pincode] || 'your location';
    const days = (parseInt(pincode[5]) % 3) + 2; 
    statusDiv.style.display = 'flex';
    statusDiv.style.color = '#22c55e'; // Green
    statusDiv.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" style="color: #22c55e; flex-shrink: 0;"><path fill="none" d="M0 0h24v24H0z"/><path d="M10 15.172l9.192-9.193 1.415 1.414L10 18l-6.364-6.364 1.414-1.414z" fill="currentColor"/></svg>
      <span>Delivery available to <strong>${location}</strong>. Estimated arrival in ${days} days.</span>
    `;
  }
}

function renderRelatedProducts(currentProduct) {
  const grid = document.getElementById('related-products-grid');
  grid.innerHTML = '';

  // Get products of the same category, excluding current product
  const related = state.products
    .filter(p => p.category === currentProduct.category && p.id !== currentProduct.id)
    .slice(0, 4); // Display up to 4 related products

  if (related.length === 0) {
    grid.innerHTML = '<div class="cart-empty-message">No related products found in this category.</div>';
    return;
  }

  related.forEach(product => {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.style.cursor = 'pointer';

    let stockClass = 'in-stock';
    let stockText = `${product.stock} in stock`;
    if (product.stock === 0) {
      stockClass = 'out-of-stock';
      stockText = 'Out of Stock';
    } else if (product.stock <= 5) {
      stockClass = 'low-stock';
      stockText = `Only ${product.stock} left!`;
    }

    card.innerHTML = `
      <div class="product-image-container">
        <img class="product-image" src="${product.imageUrl}" alt="${product.name}" loading="lazy">
        <span class="product-category">${product.category}</span>
      </div>
      <div class="product-details">
        <h3 class="product-title">${product.name}</h3>
        <p class="product-desc">${product.description}</p>
        <span class="stock-tag ${stockClass}">${stockText}</span>
        <div class="product-footer">
          <span class="product-price">₹${product.price.toFixed(2)}</span>
          <button class="btn btn-primary add-to-cart-btn" data-id="${product.id}" ${product.stock === 0 ? 'disabled' : ''}>
            ${product.stock === 0 ? 'Sold Out' : 'Add to Bag'}
          </button>
        </div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.add-to-cart-btn')) {
        return;
      }
      openProductDetails(product.id);
    });

    grid.appendChild(card);
  });
}

// ==========================================================================
// SHOPPING CART LOGIC
// ==========================================================================
async function syncCart() {
  if (!state.token) return;
  try {
    state.cart = await apiRequest('/api/cart');
    updateCartBadge();
  } catch (error) {
    console.error('Error syncing cart:', error.message);
  }
}

function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  const count = state.cart.items.reduce((acc, item) => acc + item.quantity, 0);
  badge.textContent = count;
}

async function handleAddToCart(productId, quantity = 1) {
  if (!state.token) {
    showToast('Please sign in to add items to your cart.', 'error');
    openAuthModal();
    return;
  }

  try {
    const response = await apiRequest('/api/cart', {
      method: 'POST',
      body: JSON.stringify({ productId, quantity })
    });
    
    state.cart = response.cart;
    updateCartBadge();
    showToast('Added to your shopping bag!');
    openCartDrawer();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function updateCartQty(productId, quantity) {
  try {
    const response = await apiRequest(`/api/cart/${productId}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity })
    });
    state.cart = response.cart;
    updateCartBadge();
    renderCart();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteCartItem(productId) {
  try {
    const response = await apiRequest(`/api/cart/${productId}`, {
      method: 'DELETE'
    });
    state.cart = response.cart;
    updateCartBadge();
    renderCart();
    showToast('Item removed from cart.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function clearCart() {
  try {
    const response = await apiRequest('/api/cart/clear', { method: 'POST' });
    state.cart = response.cart;
    updateCartBadge();
    renderCart();
    showToast('Shopping bag cleared.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderCart() {
  const container = document.getElementById('cart-items-container');
  const totalPriceEl = document.getElementById('cart-total-price');
  const deliveryChargeEl = document.getElementById('cart-delivery-charge');
  const grandTotalEl = document.getElementById('cart-grand-total');
  const checkoutBtn = document.getElementById('checkout-btn');
  const clearBtn = document.getElementById('clear-cart-btn');

  container.innerHTML = '';

  let deliveryCharge = 0;
  if (state.cart.items.length > 0) {
    deliveryCharge = state.cart.totalPrice >= 2000 ? 0 : 120;
  }
  const grandTotal = state.cart.totalPrice + deliveryCharge;

  totalPriceEl.textContent = `₹${state.cart.totalPrice.toFixed(2)}`;
  deliveryChargeEl.textContent = deliveryCharge === 0 && state.cart.items.length > 0 ? 'FREE' : `₹${deliveryCharge.toFixed(2)}`;
  grandTotalEl.textContent = `₹${grandTotal.toFixed(2)}`;

  if (state.cart.items.length === 0) {
    container.innerHTML = `
      <div class="cart-empty-message">
        <svg viewBox="0 0 24 24" width="48" height="48"><path fill="none" d="M0 0h24v24H0z"/><path d="M4 16V4H2V2h3a1 1 0 0 1 1 1v12h12.438l2-8H8V5h13.72a1 1 0 0 1 .97 1.243l-2.5 10a1 1 0 0 1-.97.757H5a1 1 0 0 1-1-1zm2 5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0zm10 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0z" fill="currentColor"/></svg>
        <p>Your shopping bag is empty.</p>
      </div>
    `;
    checkoutBtn.classList.add('hidden');
    clearBtn.classList.add('hidden');
    return;
  }

  checkoutBtn.classList.remove('hidden');
  clearBtn.classList.remove('hidden');

  state.cart.items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = `
      <img class="cart-item-image" src="${item.product.imageUrl}" alt="${item.product.name}">
      <div class="cart-item-info">
        <h4>${item.product.name}</h4>
        <div class="cart-item-price">₹${item.product.price.toFixed(2)}</div>
        <div class="quantity-selector">
          <button class="qty-btn dec-qty-btn" data-id="${item.product.id}" data-qty="${item.quantity}">-</button>
          <span class="qty-val">${item.quantity}</span>
          <button class="qty-btn inc-qty-btn" data-id="${item.product.id}" data-qty="${item.quantity}">+</button>
        </div>
      </div>
      <div class="cart-item-actions">
        <button class="item-delete-btn" data-id="${item.product.id}" aria-label="Remove item">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="none" d="M0 0h24v24H0z"/><path d="M17 6h5v2h-2v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8H2V6h5V3a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v3zm1 2H6v12h12V8zm-9 3h2v6H9v-6zm4 0h2v6h-2v-6zM9 4v2h6V4H9z" fill="currentColor"/></svg>
        </button>
      </div>
    `;
    container.appendChild(row);
  });

  // Attach item action events
  document.querySelectorAll('.dec-qty-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      const qty = parseInt(e.target.getAttribute('data-qty'), 10);
      if (qty > 1) updateCartQty(id, qty - 1);
    });
  });

  document.querySelectorAll('.inc-qty-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      const qty = parseInt(e.target.getAttribute('data-qty'), 10);
      updateCartQty(id, qty + 1);
    });
  });

  document.querySelectorAll('.item-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      deleteCartItem(id);
    });
  });
}

// ==========================================================================
// ORDERS LOGIC
// ==========================================================================
async function confirmGatewayPayment() {
  const confirmBtn = document.getElementById('confirm-payment-btn');
  const originalText = confirmBtn.textContent;
  const address = document.getElementById('shipping-address').value.trim();
  const payment = document.getElementById('payment-method').value;

  if (!address) {
    showToast('Shipping address is required to place your order.', 'error');
    return;
  }

  // If Cash on Delivery is selected, bypass Razorpay completely
  if (payment === 'Cash on Delivery') {
    try {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Registering COD order...';

      const response = await apiRequest('/api/orders', {
        method: 'POST',
        body: JSON.stringify({ shippingAddress: address, paymentMethod: payment })
      });

      showToast(response.message || 'COD Order placed successfully!');
      state.cart = { items: [], totalPrice: 0 };
      updateCartBadge();
      
      document.getElementById('shipping-address').value = '';
      switchSection('orders-section');
      fetchOrders();
      fetchProducts();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = originalText;
    }
    return;
  }

  // For GPay, Paytm, and Debit Card, use Razorpay checkout
  let openedGateway = false;
  try {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Connecting secure gateway...';

    const orderRes = await apiRequest('/api/payment/create-order', {
      method: 'POST',
      body: JSON.stringify({ amount: state.cart.totalPrice })
    });

    if (!orderRes.success) {
      throw new Error(orderRes.message || 'Failed to create gateway order.');
    }

    if (orderRes.mockMode) {
      // Mock Mode: credentials missing in .env, simulate payment gateway prompt
      const approval = confirm(
        `🛡️ Razorpay Sandbox (Mock Mode):\n\n` +
        `Simulate payment of ₹${(orderRes.amount / 100).toFixed(2)} via ${payment}?\n\n` +
        `Click [OK] to authorize payment or [Cancel] to decline.`
      );

      if (approval) {
        confirmBtn.textContent = 'Authorizing mock transaction...';
        
        // Call verification with mock flag
        const verifyRes = await apiRequest('/api/payment/verify-signature', {
          method: 'POST',
          body: JSON.stringify({ mockMode: true })
        });

        if (verifyRes.success) {
          confirmBtn.textContent = 'Registering order...';
          const orderResponse = await apiRequest('/api/orders', {
            method: 'POST',
            body: JSON.stringify({
              shippingAddress: address,
              paymentMethod: payment,
              paymentVerified: true
            })
          });

          showToast('Payment successful! Order has been placed.');
          state.cart = { items: [], totalPrice: 0 };
          updateCartBadge();
          document.getElementById('shipping-address').value = '';
          switchSection('orders-section');
          fetchOrders();
          fetchProducts();
        }
      } else {
        showToast('Payment authorization cancelled by user.', 'warning');
      }
    } else {
      // Real Mode: credentials configured in .env, open checkout modal
      openedGateway = true;
      const options = {
        key: orderRes.keyId,
        amount: orderRes.amount,
        currency: orderRes.currency,
        name: "AETHER Inc.",
        description: `Order Checkout Payment (${payment})`,
        order_id: orderRes.orderId,
        handler: async function (response) {
          try {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Verifying signature...';

            const verifyRes = await apiRequest('/api/payment/verify-signature', {
              method: 'POST',
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              })
            });

            if (verifyRes.success) {
              confirmBtn.textContent = 'Finalizing order...';
              const orderResponse = await apiRequest('/api/orders', {
                method: 'POST',
                body: JSON.stringify({
                  shippingAddress: address,
                  paymentMethod: payment,
                  razorpayPaymentId: response.razorpay_payment_id
                })
              });

              showToast(orderResponse.message || 'Payment successful! Order placed.');
              state.cart = { items: [], totalPrice: 0 };
              updateCartBadge();
              document.getElementById('shipping-address').value = '';
              switchSection('orders-section');
              fetchOrders();
              fetchProducts();
            }
          } catch (err) {
            showToast(err.message, 'error');
          } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = originalText;
          }
        },
        prefill: {
          name: state.user ? state.user.name : "",
          email: state.user ? state.user.email : ""
        },
        theme: {
          color: "#00f2fe"
        },
        modal: {
          ondismiss: function () {
            showToast('Secure payment window closed.', 'warning');
            confirmBtn.disabled = false;
            confirmBtn.textContent = originalText;
          }
        }
      };

      const rzp = new Razorpay(options);
      rzp.open();
    }
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    if (!openedGateway) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = originalText;
    }
  }
}

function cancelPaymentFlow() {
  document.getElementById('shipping-address').value = '';
  switchSection('shop-section');
}

async function fetchOrders() {
  const container = document.getElementById('orders-list');
  container.innerHTML = '<div class="cart-empty-message">Retrieving order receipt logs...</div>';

  try {
    const orders = await apiRequest('/api/orders');
    renderOrders(orders);
  } catch (error) {
    container.innerHTML = `<div class="cart-empty-message" style="color: #ef4444;">Failed to load orders: ${error.message}</div>`;
  }
}

function renderOrders(orders) {
  const container = document.getElementById('orders-list');
  container.innerHTML = '';

  if (orders.length === 0) {
    container.innerHTML = `
      <div class="cart-empty-message">
        <p>You haven't placed any orders yet.</p>
        <button id="orders-go-shop" class="btn btn-primary" style="margin-top: 15px;">Shop Premium Goods</button>
      </div>
    `;
    document.getElementById('orders-go-shop').addEventListener('click', () => switchSection('shop-section'));
    return;
  }

  orders.forEach(order => {
    const card = document.createElement('div');
    card.className = 'order-card';

    const formattedDate = new Date(order.createdAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const itemsHTML = order.items.map(item => `
      <div class="order-item-row">
        <span class="order-item-name">${item.name} <span style="color: var(--text-muted);">x ${item.quantity}</span></span>
        <span>₹${item.itemTotal.toFixed(2)}</span>
      </div>
    `).join('');

    card.innerHTML = `
      <div class="order-header">
        <div class="order-meta">
          <h3>Order ID: ${order.id}</h3>
          <div class="order-date">Placed on: ${formattedDate}</div>
        </div>
        <span class="order-badge-status ${order.status.toLowerCase()}">${order.status}</span>
      </div>
      <div class="order-items">
        ${itemsHTML}
      </div>
      <div class="order-footer">
        <div class="order-address"><strong>Shipping:</strong> ${order.shippingAddress} | <strong>Payment:</strong> ${order.paymentMethod}</div>
        <div class="order-price">Total Paid: <span>₹${order.totalPrice.toFixed(2)}</span></div>
      </div>
    `;
    container.appendChild(card);
  });
}

// ==========================================================================
// ADMIN DASHBOARD LOGIC
// ==========================================================================
function toggleAdminTab(tabName) {
  const prodTab = document.getElementById('admin-tab-products');
  const orderTab = document.getElementById('admin-tab-orders');
  const scraperTab = document.getElementById('admin-tab-scraper');
  const prodView = document.getElementById('admin-products-view');
  const orderView = document.getElementById('admin-orders-view');
  const scraperView = document.getElementById('admin-scraper-view');

  // Reset active classes
  prodTab.classList.remove('active');
  orderTab.classList.remove('active');
  scraperTab.classList.remove('active');
  prodView.classList.remove('active-view');
  orderView.classList.remove('active-view');
  scraperView.classList.remove('active-view');

  if (tabName === 'products') {
    prodTab.classList.add('active');
    prodView.classList.add('active-view');
    document.getElementById('admin-products-search').value = '';
    loadAdminProducts();
  } else if (tabName === 'orders') {
    orderTab.classList.add('active');
    orderView.classList.add('active-view');
    loadAdminOrders();
  } else if (tabName === 'scraper') {
    scraperTab.classList.add('active');
    scraperView.classList.add('active-view');
  }
}

async function runScraper() {
  const consoleEl = document.getElementById('scraper-console');
  const runBtn = document.getElementById('run-scraper-btn');
  const source = document.getElementById('scraper-source-select').value;
  const categoryFilter = document.getElementById('scraper-category-select').value;

  runBtn.disabled = true;
  consoleEl.innerHTML = '';
  
  const writeLog = (text) => {
    consoleEl.innerHTML += `${consoleEl.innerHTML ? '\n' : ''}${text}`;
    consoleEl.scrollTop = consoleEl.scrollHeight;
  };

  writeLog(`[System] Initializing Product Importer Feed Stream...`);
  writeLog(`[System] Selected source feed: ${source === 'dummyjson' ? 'DummyJSON API' : 'Fake Store API'}`);
  writeLog(`[System] Filter category: ${categoryFilter}`);
  writeLog(`[Network] Contacting e-commerce sandbox endpoints...`);

  try {
    const res = await apiRequest('/api/admin/scrape', {
      method: 'POST',
      body: JSON.stringify({ source, categoryFilter })
    });

    if (res.success) {
      // Print backend logs to our interactive console with small delays to look like a live process!
      for (const log of res.logs) {
        writeLog(log);
        // Wait 80ms to make it feel like real stream parsing!
        await new Promise(resolve => setTimeout(resolve, 80));
      }
      writeLog(`\n[Success] Imported ${res.count} products successfully! Catalog refreshed.`);
      showToast(`Scrape completed! ${res.count} items imported.`);
      
      // Refresh shop catalog
      fetchProducts(); 
    } else {
      writeLog(`\n[Error] Importer failed: ${res.message}`);
    }
  } catch (err) {
    writeLog(`\n[Critical Error] Connection failed: ${err.message}`);
  } finally {
    runBtn.disabled = false;
  }
}

async function runCustomScraper() {
  const consoleEl = document.getElementById('scraper-console');
  const runBtn = document.getElementById('run-custom-scraper-btn');
  const customUrl = document.getElementById('scraper-custom-url').value.trim();
  const customCategory = document.getElementById('scraper-custom-category').value.trim();

  if (!customUrl) {
    showToast('Please enter a product URL to scrape.', 'error');
    return;
  }

  runBtn.disabled = true;
  consoleEl.innerHTML = '';
  
  const writeLog = (text) => {
    consoleEl.innerHTML += `${consoleEl.innerHTML ? '\n' : ''}${text}`;
    consoleEl.scrollTop = consoleEl.scrollHeight;
  };

  writeLog(`[System] Initializing Custom URL Live Web Scraper...`);
  writeLog(`[System] Target URL: ${customUrl}`);
  writeLog(`[System] Custom Category Tag: ${customCategory || 'Imported'}`);

  try {
    const res = await apiRequest('/api/admin/scrape', {
      method: 'POST',
      body: JSON.stringify({ customUrl, customCategory })
    });

    if (res.success) {
      for (const log of res.logs) {
        writeLog(log);
        await new Promise(resolve => setTimeout(resolve, 80));
      }
      writeLog(`\n[Success] Web page scraped and imported successfully!`);
      showToast(`Scrape complete! Imported "${res.products[0].name.substring(0, 20)}..."`);
      
      // Clear input fields
      document.getElementById('scraper-custom-url').value = '';
      document.getElementById('scraper-custom-category').value = '';
      
      fetchProducts(); 
    } else {
      writeLog(`\n[Error] Scraper failed: ${res.message}`);
    }
  } catch (err) {
    writeLog(`\n[Critical Error] Connection failed: ${err.message}`);
  } finally {
    runBtn.disabled = false;
  }
}



async function loadAdminProducts() {
  const listContainer = document.getElementById('admin-products-list');
  listContainer.innerHTML = '<div class="cart-empty-message">Loading products...</div>';
  
  try {
    let products = await apiRequest('/api/products');
    
    const query = document.getElementById('admin-products-search').value.toLowerCase().trim();
    if (query) {
      products = products.filter(p => 
        p.name.toLowerCase().includes(query) || 
        p.category.toLowerCase().includes(query) ||
        (p.description && p.description.toLowerCase().includes(query))
      );
    }

    // Sort products
    const sortBy = document.getElementById('admin-products-sort').value;
    if (sortBy === 'name-asc') {
      products.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'name-desc') {
      products.sort((a, b) => b.name.localeCompare(a.name));
    } else if (sortBy === 'price-asc') {
      products.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price-desc') {
      products.sort((a, b) => b.price - a.price);
    } else if (sortBy === 'stock-asc') {
      products.sort((a, b) => a.stock - b.stock);
    } else if (sortBy === 'stock-desc') {
      products.sort((a, b) => b.stock - a.stock);
    }

    if (products.length === 0) {
      listContainer.innerHTML = '<div class="cart-empty-message">No matching products found.</div>';
      return;
    }
    
    let html = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Image</th>
            <th>Name</th>
            <th>Category</th>
            <th>Price</th>
            <th>Stock</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    products.forEach(p => {
      html += `
        <tr>
          <td><img src="${p.imageUrl || 'https://via.placeholder.com/40'}" class="product-thumb" alt="${p.name}"></td>
          <td><strong>${p.name}</strong></td>
          <td>${p.category}</td>
          <td>₹${p.price.toFixed(2)}</td>
          <td>${p.stock}</td>
          <td class="admin-actions">
            <button class="btn btn-warning btn-xs edit-product-btn" data-id="${p.id}">Edit</button>
            <button class="btn btn-danger btn-xs delete-product-btn" data-id="${p.id}">Delete</button>
          </td>
        </tr>
      `;
    });
    
    html += '</tbody></table>';
    listContainer.innerHTML = html;

    // Attach click listeners
    document.querySelectorAll('.edit-product-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-id');
        openAdminProductModal(id);
      });
    });

    document.querySelectorAll('.delete-product-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this product?')) {
          deleteProduct(id);
        }
      });
    });

  } catch (error) {
    listContainer.innerHTML = `<div class="cart-empty-message" style="color: #ef4444;">Failed to load products: ${error.message}</div>`;
  }
}

async function loadAdminOrders() {
  const listContainer = document.getElementById('admin-orders-list');
  listContainer.innerHTML = '<div class="cart-empty-message">Loading orders...</div>';
  
  try {
    const orders = await apiRequest('/api/admin/orders');
    
    if (orders.length === 0) {
      listContainer.innerHTML = '<div class="cart-empty-message">No orders placed yet.</div>';
      return;
    }

    let html = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Order ID</th>
            <th>Customer</th>
            <th>Date</th>
            <th>Total Price</th>
            <th>Payment</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    orders.forEach(o => {
      const date = new Date(o.createdAt).toLocaleDateString();
      html += `
        <tr>
          <td><code>${o.id}</code></td>
          <td>
            <strong>${o.userName}</strong><br>
            <span style="font-size: 0.8rem; color: var(--text-gray);">${o.userEmail}</span>
          </td>
          <td>${date}</td>
          <td>₹${o.totalPrice.toFixed(2)}</td>
          <td>${o.paymentMethod}</td>
          <td>
            <select class="admin-status-select order-status-select" data-id="${o.id}">
              <option value="Processing" ${o.status === 'Processing' ? 'selected' : ''}>Processing</option>
              <option value="Shipped" ${o.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
              <option value="Delivered" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
              <option value="Cancelled" ${o.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
          </td>
        </tr>
      `;
    });
    
    html += '</tbody></table>';
    listContainer.innerHTML = html;

    // Attach status change listeners
    document.querySelectorAll('.order-status-select').forEach(select => {
      select.addEventListener('change', async (e) => {
        const id = e.target.getAttribute('data-id');
        const newStatus = e.target.value;
        await updateOrderStatus(id, newStatus);
      });
    });

  } catch (error) {
    listContainer.innerHTML = `<div class="cart-empty-message" style="color: #ef4444;">Failed to load orders: ${error.message}</div>`;
  }
}

async function updateOrderStatus(id, status) {
  try {
    await apiRequest(`/api/admin/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    showToast('Order status updated successfully');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteProduct(id) {
  try {
    await apiRequest(`/api/admin/products/${id}`, { method: 'DELETE' });
    showToast('Product deleted successfully');
    loadAdminProducts();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function openAdminProductModal(id = null) {
  const modal = document.getElementById('admin-product-modal');
  const form = document.getElementById('admin-product-form');
  const title = document.getElementById('admin-modal-title');
  
  form.reset();
  document.getElementById('admin-product-id').value = '';
  
  if (id) {
    title.textContent = 'Edit Product';
    try {
      const product = await apiRequest(`/api/products/${id}`);
      document.getElementById('admin-product-id').value = product.id;
      document.getElementById('admin-product-name').value = product.name;
      document.getElementById('admin-product-category').value = product.category;
      document.getElementById('admin-product-price').value = product.price;
      document.getElementById('admin-product-stock').value = product.stock;
      document.getElementById('admin-product-image').value = product.imageUrl || '';
      document.getElementById('admin-product-desc').value = product.description || '';
    } catch (error) {
      showToast(error.message, 'error');
      return;
    }
  } else {
    title.textContent = 'Add New Product';
  }
  
  modal.classList.add('active');
}

function closeAdminProductModal() {
  document.getElementById('admin-product-modal').classList.remove('active');
}

async function handleProductSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('admin-product-id').value;
  const name = document.getElementById('admin-product-name').value.trim();
  const category = document.getElementById('admin-product-category').value;
  const price = parseFloat(document.getElementById('admin-product-price').value);
  const stock = parseInt(document.getElementById('admin-product-stock').value, 10);
  const imageUrl = document.getElementById('admin-product-image').value.trim();
  const description = document.getElementById('admin-product-desc').value.trim();
  
  const body = { name, category, price, stock, imageUrl, description };
  const endpoint = id ? `/api/admin/products/${id}` : '/api/admin/products';
  const method = id ? 'PUT' : 'POST';
  
  try {
    await apiRequest(endpoint, {
      method,
      body: JSON.stringify(body)
    });
    showToast(`Product ${id ? 'updated' : 'created'} successfully`);
    closeAdminProductModal();
    loadAdminProducts();
    fetchProducts(); // refresh the main shop catalog too
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ==========================================================================
// NAVIGATION & PAGE SECTION TOGGLE
// ==========================================================================
function switchSection(targetId) {
  const shopSec = document.getElementById('shop-section');
  const orderSec = document.getElementById('orders-section');
  const adminSec = document.getElementById('admin-section');
  const paymentSec = document.getElementById('payment-section');
  const detailSec = document.getElementById('product-detail-section');
  const heroBanner = document.getElementById('hero-banner');
  const navShop = document.getElementById('nav-shop');
  const navOrders = document.getElementById('nav-orders');
  const navAdmin = document.getElementById('nav-admin');

  navShop.classList.remove('active');
  navOrders.classList.remove('active');
  navAdmin.classList.remove('active');

  // Hide all sections first
  shopSec.classList.add('inactive-section');
  shopSec.classList.remove('active-section');
  orderSec.classList.add('inactive-section');
  orderSec.classList.remove('active-section');
  adminSec.classList.add('inactive-section');
  adminSec.classList.remove('active-section');
  paymentSec.classList.add('inactive-section');
  paymentSec.classList.remove('active-section');
  detailSec.classList.add('inactive-section');
  detailSec.classList.remove('active-section');

  if (targetId === 'shop-section') {
    shopSec.classList.add('active-section');
    shopSec.classList.remove('inactive-section');
    heroBanner.classList.remove('hidden');
    navShop.classList.add('active');
  } else if (targetId === 'orders-section') {
    orderSec.classList.add('active-section');
    orderSec.classList.remove('inactive-section');
    heroBanner.classList.add('hidden');
    navOrders.classList.add('active');
    fetchOrders();
  } else if (targetId === 'admin-section') {
    adminSec.classList.add('active-section');
    adminSec.classList.remove('inactive-section');
    heroBanner.classList.add('hidden');
    navAdmin.classList.add('active');
    loadAdminProducts();
  } else if (targetId === 'payment-section') {
    paymentSec.classList.add('active-section');
    paymentSec.classList.remove('inactive-section');
    heroBanner.classList.add('hidden');
  } else if (targetId === 'product-detail-section') {
    detailSec.classList.add('active-section');
    detailSec.classList.remove('inactive-section');
    heroBanner.classList.add('hidden');
  }
}

// ==========================================================================
// DRAWER & MODAL UI TOGGLES
// ==========================================================================
function openCartDrawer() {
  document.getElementById('cart-drawer').classList.add('active');
  renderCart();
}

function closeCartDrawer() {
  document.getElementById('cart-drawer').classList.remove('active');
}

function openAuthModal() {
  document.getElementById('auth-modal').classList.add('active');
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.remove('active');
  document.getElementById('login-form').reset();
  document.getElementById('signup-form').reset();
  
  const forgotForm = document.getElementById('forgot-password-form');
  if (forgotForm) {
    forgotForm.reset();
    document.getElementById('forgot-email-step').classList.remove('hidden');
    document.getElementById('forgot-reset-step').classList.add('hidden');
  }
  
  // Reset OTP registration fields
  document.getElementById('signup-otp-group').classList.add('hidden');
  document.getElementById('signup-submit-btn').classList.add('hidden');
  document.getElementById('signup-send-otp-btn').classList.remove('hidden');
}

// Toggle Auth Tabs (Login vs Sign Up)
function toggleAuthTab(tab) {
  const loginTab = document.getElementById('tab-login');
  const signupTab = document.getElementById('tab-signup');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const forgotForm = document.getElementById('forgot-password-form');

  if (forgotForm) {
    forgotForm.classList.remove('active-form');
  }

  if (tab === 'login') {
    loginTab.classList.add('active');
    signupTab.classList.remove('active');
    loginForm.classList.add('active-form');
    signupForm.classList.remove('active-form');
  } else {
    signupTab.classList.add('active');
    loginTab.classList.remove('active');
    signupForm.classList.add('active-form');
    loginForm.classList.remove('active-form');
  }
}

// ==========================================================================
// APPLICATION INITIALIZATION & EVENT LISTENERS
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Check auth and sync cart on load
  initAuth();
  initGoogleSignIn();
  fetchProducts();

  // Navigation Links
  document.getElementById('brand-logo').addEventListener('click', (e) => {
    e.preventDefault();
    switchSection('shop-section');
  });
  document.getElementById('nav-shop').addEventListener('click', (e) => {
    e.preventDefault();
    switchSection('shop-section');
  });
  document.getElementById('nav-orders').addEventListener('click', (e) => {
    e.preventDefault();
    switchSection('orders-section');
  });
  document.getElementById('nav-admin').addEventListener('click', (e) => {
    e.preventDefault();
    switchSection('admin-section');
  });
  document.getElementById('detail-back-btn').addEventListener('click', (e) => {
    e.preventDefault();
    switchSection('shop-section');
  });
  document.getElementById('hero-cta-btn').addEventListener('click', () => {
    document.getElementById('shop-section').scrollIntoView({ behavior: 'smooth' });
  });

  // Product Detail Page Quantity and Add to Bag Controls
  document.getElementById('detail-qty-minus').addEventListener('click', () => {
    const qtyInput = document.getElementById('detail-quantity');
    let currentQty = parseInt(qtyInput.value) || 1;
    if (currentQty > 1) {
      qtyInput.value = currentQty - 1;
    }
  });

  document.getElementById('detail-qty-plus').addEventListener('click', () => {
    const qtyInput = document.getElementById('detail-quantity');
    let currentQty = parseInt(qtyInput.value) || 1;
    const maxStock = state.currentProduct ? state.currentProduct.stock : 99;
    if (currentQty < maxStock) {
      qtyInput.value = currentQty + 1;
    } else {
      showToast(`Cannot select more than available stock (${maxStock})`, 'error');
    }
  });

  document.getElementById('detail-add-btn').addEventListener('click', () => {
    if (!state.currentProduct) return;
    const qtyInput = document.getElementById('detail-quantity');
    const qty = parseInt(qtyInput.value) || 1;
    handleAddToCart(state.currentProduct.id, qty);
  });

  // Pincode Availability Checker Control
  document.getElementById('detail-pincode-btn').addEventListener('click', () => {
    const pincode = document.getElementById('detail-pincode-input').value.trim();
    checkPincodeAvailability(pincode);
  });

  // Drawer / Overlay Toggles
  document.getElementById('cart-toggle-btn').addEventListener('click', openCartDrawer);
  document.getElementById('cart-close-btn').addEventListener('click', closeCartDrawer);
  document.getElementById('cart-overlay').addEventListener('click', closeCartDrawer);

  // Delivery Location Modal Controls
  const headerLocText = document.getElementById('header-location-text');
  const modalAddrInput = document.getElementById('modal-address-input');
  const modalPinInput = document.getElementById('modal-pincode-input');
  
  if (state.deliveryAddress || state.deliveryPincode) {
    modalAddrInput.value = state.deliveryAddress;
    modalPinInput.value = state.deliveryPincode;
    
    const addr = state.deliveryAddress;
    const pin = state.deliveryPincode;
    if (addr && pin) {
      const shortAddr = addr.length > 12 ? addr.substring(0, 9) + '...' : addr;
      headerLocText.textContent = `${pin} - ${shortAddr}`;
    } else if (pin) {
      headerLocText.textContent = pin;
    } else if (addr) {
      headerLocText.textContent = addr.length > 18 ? addr.substring(0, 15) + '...' : addr;
    }
  }

  document.getElementById('header-location-selector').addEventListener('click', () => {
    const modalAddrInput = document.getElementById('modal-address-input');
    if (!state.token) {
      modalAddrInput.disabled = true;
      modalAddrInput.placeholder = "Please login to add a delivery address.";
      modalAddrInput.value = "";
    } else {
      modalAddrInput.disabled = false;
      modalAddrInput.placeholder = "Enter your shipping address (e.g. House No, Street, City)";
    }
    document.getElementById('location-modal').classList.add('active');
  });

  const closeLocationModal = () => {
    document.getElementById('location-modal').classList.remove('active');
  };
  document.getElementById('location-close-btn').addEventListener('click', closeLocationModal);
  document.getElementById('location-overlay').addEventListener('click', closeLocationModal);

  document.getElementById('modal-location-save-btn').addEventListener('click', () => {
    const addressVal = modalAddrInput.value.trim();
    const pincodeVal = modalPinInput.value.trim();

    if (pincodeVal && !/^\d{6}$/.test(pincodeVal)) {
      showToast('Please enter a valid 6-digit Pincode.', 'error');
      return;
    }

    if (!addressVal && !pincodeVal) {
      state.deliveryAddress = '';
      state.deliveryPincode = '';
      localStorage.removeItem('aether_delivery_address');
      localStorage.removeItem('aether_delivery_pincode');
      headerLocText.textContent = 'Add Address';
      showToast('Delivery location cleared.');
    } else {
      state.deliveryAddress = addressVal;
      state.deliveryPincode = pincodeVal;
      localStorage.setItem('aether_delivery_address', addressVal);
      localStorage.setItem('aether_delivery_pincode', pincodeVal);
      
      if (addressVal && pincodeVal) {
        const shortAddr = addressVal.length > 12 ? addressVal.substring(0, 9) + '...' : addressVal;
        headerLocText.textContent = `${pincodeVal} - ${shortAddr}`;
      } else if (pincodeVal) {
        headerLocText.textContent = pincodeVal;
      } else {
        headerLocText.textContent = addressVal.length > 18 ? addressVal.substring(0, 15) + '...' : addressVal;
      }
      showToast('Delivery address saved!');
    }
    closeLocationModal();
  });
  
  document.getElementById('auth-close-btn').addEventListener('click', closeAuthModal);
  document.getElementById('auth-overlay').addEventListener('click', closeAuthModal);

  // Tab Toggles
  document.getElementById('tab-login').addEventListener('click', () => toggleAuthTab('login'));
  document.getElementById('tab-signup').addEventListener('click', () => toggleAuthTab('signup'));

  // Catalog Filters & Sorting
  document.getElementById('category-pills').addEventListener('click', (e) => {
    if (e.target.classList.contains('pill')) {
      document.querySelectorAll('#category-pills .pill').forEach(p => p.classList.remove('active'));
      e.target.classList.add('active');
      state.filters.category = e.target.getAttribute('data-category');
      fetchProducts();
    }
  });

  document.getElementById('sort-select').addEventListener('change', (e) => {
    state.filters.sort = e.target.value;
    fetchProducts();
  });

  // Search Input Debouncing
  let searchTimeout;
  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.filters.search = e.target.value.trim();
      fetchProducts();
    }, 400); // 400ms debounce
  });

  // Cart operations
  document.getElementById('clear-cart-btn').addEventListener('click', clearCart);
  
  const checkoutBtn = document.getElementById('checkout-btn');
  checkoutBtn.addEventListener('click', () => {
    if (!state.token) {
      openAuthModal();
      showToast('Please login/signup to complete checkout.', 'error');
      return;
    }
    if (state.cart.items.length === 0) {
      showToast('Your shopping bag is empty.', 'error');
      return;
    }
    
    // Set total price inside payment section summary
    const deliveryCharge = state.cart.totalPrice >= 2000 ? 0 : 120;
    const grandTotal = state.cart.totalPrice + deliveryCharge;
    document.getElementById('gateway-total-price').textContent = '₹' + grandTotal.toFixed(2);

    // Auto-fill delivery address field in checkout
    if (state.deliveryAddress || state.deliveryPincode) {
      let fullAddress = state.deliveryAddress || '';
      if (state.deliveryPincode) {
        fullAddress += (fullAddress ? '\nPincode: ' : '') + state.deliveryPincode;
      }
      document.getElementById('shipping-address').value = fullAddress;
    }
    
    // Reset payment selection to default GPay
    document.getElementById('payment-method').value = 'Google Pay';
    document.querySelectorAll('.payment-option-card').forEach(card => {
      if (card.getAttribute('data-value') === 'Google Pay') {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });

    closeCartDrawer();
    switchSection('payment-section');
  });

  // Payment option card toggles
  document.querySelectorAll('.payment-option-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const button = e.currentTarget;
      document.querySelectorAll('.payment-option-card').forEach(c => c.classList.remove('active'));
      button.classList.add('active');
      document.getElementById('payment-method').value = button.getAttribute('data-value');
    });
  });

  // Form Submissions
  document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    login(email, password);
  });

  document.getElementById('signup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const otp = document.getElementById('signup-otp').value.trim();
    signup(name, email, password, otp);
  });

  document.getElementById('signup-send-otp-btn').addEventListener('click', () => {
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;

    if (!name || !email || !password) {
      showToast('Please fill out Full Name, Email, and Password first.', 'error');
      return;
    }
    if (password.length < 6) {
      showToast('Password must be at least 6 characters.', 'error');
      return;
    }
    sendOtp(email);
  });

  // Forgot Password Event Listeners
  document.getElementById('forgot-password-link').addEventListener('click', (e) => {
    e.preventDefault();
    showForgotPasswordForm();
  });

  document.getElementById('forgot-back-to-login').addEventListener('click', (e) => {
    e.preventDefault();
    toggleAuthTab('login');
  });

  document.getElementById('forgot-send-otp-btn').addEventListener('click', () => {
    const email = document.getElementById('forgot-email').value.trim();
    if (!email) {
      showToast('Please enter your email address.', 'error');
      return;
    }
    sendForgotOtp(email);
  });

  document.getElementById('forgot-password-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value.trim();
    const otp = document.getElementById('forgot-otp').value.trim();
    const newPassword = document.getElementById('forgot-new-password').value;
    const confirmPassword = document.getElementById('forgot-confirm-password').value;

    if (!email || !otp || !newPassword || !confirmPassword) {
      showToast('Please fill out all fields.', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match.', 'error');
      return;
    }

    resetPassword(email, otp, newPassword);
  });

  // Payment Section Event Listeners
  document.getElementById('payment-back-btn').addEventListener('click', cancelPaymentFlow);
  document.getElementById('confirm-payment-btn').addEventListener('click', confirmGatewayPayment);

  // Admin Event Listeners
  document.getElementById('admin-tab-products').addEventListener('click', () => toggleAdminTab('products'));
  document.getElementById('admin-tab-orders').addEventListener('click', () => toggleAdminTab('orders'));
  document.getElementById('admin-tab-scraper').addEventListener('click', () => toggleAdminTab('scraper'));
  document.getElementById('admin-add-product-btn').addEventListener('click', () => openAdminProductModal());
  document.getElementById('admin-product-close-btn').addEventListener('click', closeAdminProductModal);
  document.getElementById('admin-product-overlay').addEventListener('click', closeAdminProductModal);
  document.getElementById('admin-product-form').addEventListener('submit', handleProductSubmit);
  document.getElementById('admin-products-search').addEventListener('input', loadAdminProducts);
  document.getElementById('admin-products-sort').addEventListener('change', loadAdminProducts);
  document.getElementById('run-scraper-btn').addEventListener('click', runScraper);
  document.getElementById('run-custom-scraper-btn').addEventListener('click', runCustomScraper);
});
