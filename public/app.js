// ==========================================================================
// AETHER FRONTEND APPLICATION ENGINE
// ==========================================================================

// Global App State
const state = {
  products: [],
  cart: { items: [], totalPrice: 0 },
  user: null,
  token: localStorage.getItem('aether_token') || null,
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

async function signup(name, email, password) {
  try {
    const data = await apiRequest('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
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
          <span class="product-price">$${product.price.toFixed(2)}</span>
          <button class="btn btn-primary add-to-cart-btn" data-id="${product.id}" ${product.stock === 0 ? 'disabled' : ''}>
            ${product.stock === 0 ? 'Sold Out' : 'Add to Bag'}
          </button>
        </div>
      </div>
    `;

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

async function handleAddToCart(productId) {
  if (!state.token) {
    showToast('Please sign in to add items to your cart.', 'error');
    openAuthModal();
    return;
  }

  try {
    const response = await apiRequest('/api/cart', {
      method: 'POST',
      body: JSON.stringify({ productId, quantity: 1 })
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
  const checkoutBtn = document.getElementById('checkout-btn');
  const clearBtn = document.getElementById('clear-cart-btn');
  const checkoutFormContainer = document.getElementById('checkout-form-container');

  container.innerHTML = '';
  totalPriceEl.textContent = `$${state.cart.totalPrice.toFixed(2)}`;

  if (state.cart.items.length === 0) {
    container.innerHTML = `
      <div class="cart-empty-message">
        <svg viewBox="0 0 24 24" width="48" height="48"><path fill="none" d="M0 0h24v24H0z"/><path d="M4 16V4H2V2h3a1 1 0 0 1 1 1v12h12.438l2-8H8V5h13.72a1 1 0 0 1 .97 1.243l-2.5 10a1 1 0 0 1-.97.757H5a1 1 0 0 1-1-1zm2 5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0zm10 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0z" fill="currentColor"/></svg>
        <p>Your shopping bag is empty.</p>
      </div>
    `;
    checkoutBtn.classList.add('hidden');
    clearBtn.classList.add('hidden');
    checkoutFormContainer.classList.add('hidden');
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
        <div class="cart-item-price">$${item.product.price.toFixed(2)}</div>
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
async function submitOrder(e) {
  e.preventDefault();
  const address = document.getElementById('shipping-address').value.trim();
  const payment = document.getElementById('payment-method').value;

  if (!address) {
    showToast('Shipping address is required', 'error');
    return;
  }

  try {
    const response = await apiRequest('/api/orders', {
      method: 'POST',
      body: JSON.stringify({ shippingAddress: address, paymentMethod: payment })
    });

    showToast(response.message || 'Order placed successfully!');
    state.cart = { items: [], totalPrice: 0 };
    updateCartBadge();
    
    // Reset forms & close drawers
    document.getElementById('checkout-form').reset();
    closeCartDrawer();
    
    // Switch to order history page
    switchSection('orders-section');
    fetchOrders();
    fetchProducts(); // Refresh catalog products to update stocks
  } catch (error) {
    showToast(error.message, 'error');
  }
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
        <span>$${item.itemTotal.toFixed(2)}</span>
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
        <div class="order-price">Total Paid: <span>$${order.totalPrice.toFixed(2)}</span></div>
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
  const prodView = document.getElementById('admin-products-view');
  const orderView = document.getElementById('admin-orders-view');

  if (tabName === 'products') {
    prodTab.classList.add('active');
    orderTab.classList.remove('active');
    prodView.classList.add('active-view');
    orderView.classList.remove('active-view');
    loadAdminProducts();
  } else {
    prodTab.classList.remove('active');
    orderTab.classList.add('active');
    prodView.classList.remove('active-view');
    orderView.classList.add('active-view');
    loadAdminOrders();
  }
}

async function loadAdminProducts() {
  const listContainer = document.getElementById('admin-products-list');
  listContainer.innerHTML = '<div class="cart-empty-message">Loading products...</div>';
  
  try {
    const products = await apiRequest('/api/products');
    
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
          <td>$${p.price.toFixed(2)}</td>
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
          <td>$${o.totalPrice.toFixed(2)}</td>
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
  const heroBanner = document.getElementById('hero-banner');
  const navShop = document.getElementById('nav-shop');
  const navOrders = document.getElementById('nav-orders');
  const navAdmin = document.getElementById('nav-admin');

  navShop.classList.remove('active');
  navOrders.classList.remove('active');
  navAdmin.classList.remove('active');

  if (targetId === 'shop-section') {
    shopSec.classList.add('active-section');
    shopSec.classList.remove('inactive-section');
    orderSec.classList.add('inactive-section');
    orderSec.classList.remove('active-section');
    adminSec.classList.add('inactive-section');
    adminSec.classList.remove('active-section');
    heroBanner.classList.remove('hidden');
    navShop.classList.add('active');
  } else if (targetId === 'orders-section') {
    orderSec.classList.add('active-section');
    orderSec.classList.remove('inactive-section');
    shopSec.classList.add('inactive-section');
    shopSec.classList.remove('active-section');
    adminSec.classList.add('inactive-section');
    adminSec.classList.remove('active-section');
    heroBanner.classList.add('hidden');
    navOrders.classList.add('active');
    fetchOrders();
  } else if (targetId === 'admin-section') {
    adminSec.classList.add('active-section');
    adminSec.classList.remove('inactive-section');
    shopSec.classList.add('inactive-section');
    shopSec.classList.remove('active-section');
    orderSec.classList.add('inactive-section');
    orderSec.classList.remove('active-section');
    heroBanner.classList.add('hidden');
    navAdmin.classList.add('active');
    loadAdminProducts(); // Default view is products list
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
}

// Toggle Auth Tabs (Login vs Sign Up)
function toggleAuthTab(tab) {
  const loginTab = document.getElementById('tab-login');
  const signupTab = document.getElementById('tab-signup');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');

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
  document.getElementById('hero-cta-btn').addEventListener('click', () => {
    document.getElementById('shop-section').scrollIntoView({ behavior: 'smooth' });
  });

  // Drawer / Overlay Toggles
  document.getElementById('cart-toggle-btn').addEventListener('click', openCartDrawer);
  document.getElementById('cart-close-btn').addEventListener('click', closeCartDrawer);
  document.getElementById('cart-overlay').addEventListener('click', closeCartDrawer);
  
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
  const checkoutFormContainer = document.getElementById('checkout-form-container');
  checkoutBtn.addEventListener('click', () => {
    checkoutBtn.classList.add('hidden');
    checkoutFormContainer.classList.remove('hidden');
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
    signup(name, email, password);
  });

  document.getElementById('checkout-form').addEventListener('submit', submitOrder);

  // Admin Event Listeners
  document.getElementById('admin-tab-products').addEventListener('click', () => toggleAdminTab('products'));
  document.getElementById('admin-tab-orders').addEventListener('click', () => toggleAdminTab('orders'));
  document.getElementById('admin-add-product-btn').addEventListener('click', () => openAdminProductModal());
  document.getElementById('admin-product-close-btn').addEventListener('click', closeAdminProductModal);
  document.getElementById('admin-product-overlay').addEventListener('click', closeAdminProductModal);
  document.getElementById('admin-product-form').addEventListener('submit', handleProductSubmit);
});
