# Simple E-Commerce Backend API

This is a Node.js Express backend API designed for a simple e-commerce website. It features secure signup/login, product catalogs with searching and filtering, persistent shopping cart management, and inventory-managed checkout/orders.

---

## 🚀 How to Run the App

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start the Development Server** (Runs with Node.js `--watch` for automatic reloading on code changes):
   ```bash
   npm run dev
   ```
   The backend will run on `http://localhost:5000/`.

---

## 📂 Database Setup

No separate database installation (like MongoDB, PostgreSQL, or SQLite) is required. The backend uses a local, lightweight file system database stored inside the `data/` folder:
* `data/users.json` — Stores registered users, hashed passwords, and shopping carts.
* `data/products.json` — Stores product catalog and remaining stock. Seeded automatically.
* `data/orders.json` — Stores checkout receipts and history.

You can directly view and edit these JSON files in your editor to reset or inspect data!

---

## 🔌 API Documentation & Testing Guide

All API requests must have `Content-Type: application/json` headers when sending body payloads. Protected endpoints require the `Authorization: Bearer <your_jwt_token>` header.

### 1. User Authentication (`/api/auth`)

#### 📝 Register a New User
* **URL**: `POST http://localhost:5000/api/auth/signup`
* **Request Body**:
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "securepassword123"
  }
  ```
* **Response**: Returns a session `token` and user details.

#### 🔑 User Login
* **URL**: `POST http://localhost:5000/api/auth/login`
* **Request Body**:
  ```json
  {
    "email": "jane@example.com",
    "password": "securepassword123"
  }
  ```
* **Response**: Returns a session `token` and user details.

#### 👤 Get Current User Profile (Protected)
* **URL**: `GET http://localhost:5000/api/auth/profile`
* **Headers**: `Authorization: Bearer <JWT_TOKEN>`

---

### 2. Products Catalog (`/api/products`)

#### 🛍️ Get All Products
* **URL**: `GET http://localhost:5000/api/products`
* **Query Parameters** (Optional):
  * `q`: Search keyword (e.g. `?q=phone` matches titles or descriptions)
  * `category`: Filter by category (e.g. `?category=Electronics`)
  * `sort`: Sorting options:
    * `price-asc`: Sort by price (low to high)
    * `price-desc`: Sort by price (high to low)
    * `name-asc`: Sort alphabetically (A-Z)
    * `name-desc`: Sort alphabetically (Z-A)

#### 🔍 Get Single Product Detail
* **URL**: `GET http://localhost:5000/api/products/prod-1` (Replace `prod-1` with your target product's ID)

---

### 3. Shopping Cart (`/api/cart`) (Protected)

#### 🛒 View Cart Items
* **URL**: `GET http://localhost:5000/api/cart`
* **Headers**: `Authorization: Bearer <JWT_TOKEN>`
* **Response**: Returns items in the cart populated with details, totals, and total price.

#### ➕ Add Item to Cart (or Increment Quantity)
* **URL**: `POST http://localhost:5000/api/cart`
* **Headers**: `Authorization: Bearer <JWT_TOKEN>`
* **Request Body**:
  ```json
  {
    "productId": "prod-1",
    "quantity": 2
  }
  ```

#### ✏️ Update Quantity of Cart Item (Override)
* **URL**: `PUT http://localhost:5000/api/cart/prod-1`
* **Headers**: `Authorization: Bearer <JWT_TOKEN>`
* **Request Body**:
  ```json
  {
    "quantity": 5
  }
  ```

#### ❌ Remove Item from Cart
* **URL**: `DELETE http://localhost:5000/api/cart/prod-1`
* **Headers**: `Authorization: Bearer <JWT_TOKEN>`

#### 🧼 Clear Entire Cart
* **URL**: `POST http://localhost:5000/api/cart/clear`
* **Headers**: `Authorization: Bearer <JWT_TOKEN>`

---

### 4. Orders & Checkout (`/api/orders`) (Protected)

#### 📦 Checkout Cart & Place Order
* **URL**: `POST http://localhost:5000/api/orders`
* **Headers**: `Authorization: Bearer <JWT_TOKEN>`
* **Request Body** (Optional):
  ```json
  {
    "shippingAddress": "123 Maple Street, Apt 4B, Springfield",
    "paymentMethod": "Credit Card"
  }
  ```
  *(Note: This deducts inventory from the products list and empties your cart).*

#### 📜 Get Order History
* **URL**: `GET http://localhost:5000/api/orders`
* **Headers**: `Authorization: Bearer <JWT_TOKEN>`

#### 📄 View Specific Order Detail
* **URL**: `GET http://localhost:5000/api/orders/order-1234567890` (Replace with your actual order ID)
* **Headers**: `Authorization: Bearer <JWT_TOKEN>`
