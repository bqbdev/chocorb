let sellerWhatsapp = "5519991365263";
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
let categories = ["Todos"];
let products = [];
let cart = [];
let activeCategory = "Todos";
let lastWhatsappUrl = "";
let customerLookupTimer = null;

const el = (id) => document.getElementById(id);

async function loadProducts() {
  try {
    const [productsSnap, categoriesSnap, settingsDoc] = await Promise.all([
      db.collection("products").where("active", "==", true).get(),
      db.collection("categories").where("active", "==", true).get(),
      db.collection("settings").doc("business").get()
    ]);
    if (settingsDoc.exists && settingsDoc.data().sellerWhatsapp) {
      sellerWhatsapp = settingsDoc.data().sellerWhatsapp;
    }
    products = productsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const categoryNames = categoriesSnap.docs
      .map((doc) => doc.data().name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    const productCategories = products.map((product) => product.category).filter(Boolean);
    categories = ["Todos", ...new Set([...categoryNames, ...productCategories])];
  } catch (error) {
    console.warn(error);
    products = [];
    categories = ["Todos"];
  }
  renderCategories();
  renderProducts();
}

function renderCategories() {
  el("categoryTabs").innerHTML = categories.map((cat) => `<button class="${cat === activeCategory ? "active" : ""}" data-category="${cat}">${cat}</button>`).join("");
}

function renderProducts() {
  const list = activeCategory === "Todos" ? products : products.filter((p) => p.category === activeCategory);
  if (!list.length) {
    el("productsGrid").innerHTML = `
      <div class="empty-state">
        <strong>Nenhum produto cadastrado</strong>
        <span>Assim que a loja cadastrar produtos, eles aparecerão aqui.</span>
      </div>`;
    return;
  }
  el("productsGrid").innerHTML = list.map((p) => `
    <article class="product-card">
      ${p.imageBase64 ? `<img class="product-img" src="${p.imageBase64}" alt="${p.name}">` : `<div class="placeholder-img"><strong>Produto sem imagem</strong><span>${p.name}</span></div>`}
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
    </div>`).join("") : "<p>Seu carrinho está vazio.</p>";
  const qty = cart.reduce((sum, item) => sum + item.quantity, 0);
  el("cartCount").textContent = `${qty} ${qty === 1 ? "item" : "itens"}`;
  el("cartTotal").textContent = money.format(cartTotal());
  el("floatingTotal").textContent = money.format(cartTotal());
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

async function lookupCustomerByPhone() {
  const phone = onlyDigits(el("customerPhone").value);
  if (phone.length < 10) return;
  try {
    const doc = await db.collection("customers").doc(phone).get();
    if (!doc.exists) return;
    const customer = doc.data();
    if (customer.name && !el("customerName").value.trim()) {
      el("customerName").value = customer.name;
    }
    if (customer.business && !el("customerBusiness").value.trim()) {
      el("customerBusiness").value = customer.business;
    }
  } catch (error) {
    console.warn(error);
  }
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
    notes ? `\nObservações: ${notes}` : "",
    `\nPagamento: ${paymentMethod}`,
    `Total: ${money.format(total)}`
  ].filter(Boolean);
  lastWhatsappUrl = `https://wa.me/${sellerWhatsapp}?text=${encodeURIComponent(lines.join("\n"))}`;
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
el("customerPhone").addEventListener("input", () => {
  clearTimeout(customerLookupTimer);
  customerLookupTimer = setTimeout(lookupCustomerByPhone, 450);
});
el("customerPhone").addEventListener("blur", lookupCustomerByPhone);
el("finishOrder").addEventListener("click", finishOrder);
el("continueShopping").addEventListener("click", () => {
  cart = [];
  renderCart();
  el("successModal").classList.remove("show");
  el("cartPanel").classList.remove("open");
});

loadProducts();
renderCart();

