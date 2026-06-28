const SELLER_WHATSAPP = "5511999999999";
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const categories = ["Todos", "Cones tradicionais", "Cones gourmet", "Brigadeiros", "Kits especiais"];
let products = [];
let cart = [];
let activeCategory = "Todos";
let lastWhatsappUrl = "";

function svgImage(title, colorA, colorB) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="520" viewBox="0 0 700 520"><rect width="700" height="520" fill="${colorA}"/><circle cx="540" cy="100" r="150" fill="${colorB}" opacity=".45"/><path d="M230 116h240l-66 322H296z" fill="#c27a3d"/><path d="M260 116h180v118H260z" fill="#fff1d7"/><circle cx="350" cy="104" r="92" fill="#44200f"/><circle cx="315" cy="82" r="12" fill="#f4d4a9"/><circle cx="378" cy="88" r="16" fill="#f4d4a9"/><text x="350" y="470" text-anchor="middle" font-family="Arial" font-size="42" font-weight="800" fill="#fff">${title}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

const seedProducts = [
  { name: "Cone Brigadeiro", category: "Cones tradicionais", description: "Casquinha crocante com brigadeiro cremoso.", price: 8.5, stock: 40, featured: true, active: true, imageBase64: svgImage("Cone Brigadeiro", "#6b3419", "#d99a58") },
  { name: "Cone Morango", category: "Cones gourmet", description: "Chocolate, creme especial e morangos.", price: 9.5, stock: 30, featured: true, active: true, imageBase64: svgImage("Cone Morango", "#8e2f2f", "#ffd6c2") },
  { name: "Cone Ninho", category: "Cones gourmet", description: "Recheio de leite ninho e finalizacao branca.", price: 9.5, stock: 30, featured: true, active: true, imageBase64: svgImage("Cone Ninho", "#d7a25a", "#fff3d4") },
  { name: "Brigadeiro Gourmet", category: "Brigadeiros", description: "Unidade enrolada com granulado belga.", price: 3.5, stock: 80, featured: false, active: true, imageBase64: svgImage("Brigadeiro", "#4b2111", "#c78345") },
  { name: "Kit Festa RB", category: "Kits especiais", description: "10 brigadeiros e 4 cones sortidos.", price: 58, stock: 12, featured: true, active: true, imageBase64: svgImage("Kit Festa", "#4a2414", "#f1c27d") }
];

const el = (id) => document.getElementById(id);

async function loadProducts() {
  try {
    const snap = await db.collection("products").where("active", "==", true).get();
    products = snap.empty ? seedProducts.map((p, i) => ({ id: `seed-${i}`, ...p })) : snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.warn(error);
    products = seedProducts.map((p, i) => ({ id: `seed-${i}`, ...p }));
  }
  renderCategories();
  renderProducts();
}

function renderCategories() {
  el("categoryTabs").innerHTML = categories.map((cat) => `<button class="${cat === activeCategory ? "active" : ""}" data-category="${cat}">${cat}</button>`).join("");
}

function renderProducts() {
  const list = activeCategory === "Todos" ? products : products.filter((p) => p.category === activeCategory);
  el("productsGrid").innerHTML = list.map((p) => `
    <article class="product-card">
      ${p.imageBase64 ? `<img class="product-img" src="${p.imageBase64}" alt="${p.name}">` : `<div class="placeholder-img">${p.name}</div>`}
      <div class="product-body">
        <h3>${p.name}</h3>
        <p>${p.description || ""}</p>
        <div class="price-row">
          <strong>${money.format(Number(p.price || 0))}</strong>
          <button aria-label="Adicionar ${p.name}" data-add="${p.id}">+</button>
        </div>
      </div>
    </article>`).join("");
}

function addToCart(id) {
  const product = products.find((p) => p.id === id);
  const found = cart.find((item) => item.id === id);
  if (found) found.quantity += 1;
  else cart.push({ ...product, quantity: 1, additions: [] });
  renderCart();
  el("cartPanel").classList.add("open");
}

function changeQuantity(id, diff) {
  cart = cart.map((item) => item.id === id ? { ...item, quantity: item.quantity + diff } : item).filter((item) => item.quantity > 0);
  renderCart();
}

function cartTotal() {
  return cart.reduce((sum, item) => sum + Number(item.price || 0) * item.quantity, 0);
}

function renderCart() {
  el("cartItems").innerHTML = cart.length ? cart.map((item) => `
    <div class="cart-line">
      <div>
        <strong>${item.name}</strong>
        <small>${money.format(Number(item.price || 0))} cada</small>
        <small>Adicionais: ${item.additions.length ? item.additions.join(", ") : "sem adicionais"}</small>
      </div>
      <div class="qty">
        <button data-qty="${item.id}" data-diff="-1">-</button>
        <strong>${item.quantity}</strong>
        <button data-qty="${item.id}" data-diff="1">+</button>
      </div>
    </div>`).join("") : "<p>Seu carrinho esta vazio.</p>";
  const qty = cart.reduce((sum, item) => sum + item.quantity, 0);
  el("cartCount").textContent = `${qty} ${qty === 1 ? "item" : "itens"}`;
  el("cartTotal").textContent = money.format(cartTotal());
  el("floatingTotal").textContent = money.format(cartTotal());
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

async function finishOrder() {
  const name = el("customerName").value.trim();
  const phone = onlyDigits(el("customerPhone").value);
  const business = el("customerBusiness").value.trim();
  const notes = el("orderNotes").value.trim();
  const paymentMethod = el("paymentMethod").value;
  if (!cart.length) return alert("Adicione pelo menos um produto.");
  if (!name || !phone) return alert("Informe nome e WhatsApp.");

  const total = cartTotal();
  const order = {
    customerName: name,
    customerPhone: phone,
    customerBusiness: business,
    notes,
    paymentMethod,
    total,
    status: "Novo",
    items: cart.map((item) => ({ productId: item.id, name: item.name, price: Number(item.price || 0), quantity: item.quantity, additions: item.additions || [] })),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    const ref = await db.collection("orders").add(order);
    await saveCustomer(name, phone, business, total);
    await db.collection("payments").add({ orderId: ref.id, customerName: name, value: total, method: paymentMethod, status: "Pendente", createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  } catch (error) {
    console.warn(error);
  }

  const lines = [
    "*Novo pedido Choco RB*",
    `Cliente: ${name}`,
    `WhatsApp: ${phone}`,
    business ? `Estabelecimento: ${business}` : "",
    "",
    "*Itens:*",
    ...cart.map((item) => `- ${item.quantity}x ${item.name} (${money.format(Number(item.price || 0))})${item.additions.length ? ` | Adicionais: ${item.additions.join(", ")}` : ""}`),
    notes ? `\nObservacoes: ${notes}` : "",
    `\nPagamento: ${paymentMethod}`,
    `Total: ${money.format(total)}`
  ].filter(Boolean);
  lastWhatsappUrl = `https://wa.me/${SELLER_WHATSAPP}?text=${encodeURIComponent(lines.join("\n"))}`;
  el("openWhatsappAgain").href = lastWhatsappUrl;
  el("successModal").classList.add("show");
  window.open(lastWhatsappUrl, "_blank", "noopener");
}

async function saveCustomer(name, phone, business, total) {
  const id = phone;
  await db.collection("customers").doc(id).set({
    name,
    phone,
    business,
    totalOrders: firebase.firestore.FieldValue.increment(1),
    totalPurchased: firebase.firestore.FieldValue.increment(total),
    lastOrder: firebase.firestore.FieldValue.serverTimestamp(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

document.addEventListener("click", (event) => {
  const category = event.target.dataset.category;
  const add = event.target.dataset.add;
  const qty = event.target.dataset.qty;
  if (category) { activeCategory = category; renderCategories(); renderProducts(); }
  if (add) addToCart(add);
  if (qty) changeQuantity(qty, Number(event.target.dataset.diff));
});

el("openCart").addEventListener("click", () => el("cartPanel").classList.add("open"));
el("closeCart").addEventListener("click", () => el("cartPanel").classList.remove("open"));
el("finishOrder").addEventListener("click", finishOrder);
el("continueShopping").addEventListener("click", () => {
  cart = [];
  renderCart();
  el("successModal").classList.remove("show");
  el("cartPanel").classList.remove("open");
});

loadProducts();
renderCart();
