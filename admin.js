const moneyAdmin = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const menu = [
  ["dashboard", "Dashboard"], ["orders", "Pedidos"], ["products", "Produtos"], ["categories", "Categorias"], ["customers", "Clientes"], ["stock", "Estoque"],
  ["finance", "Financeiro"], ["payments", "Recebimentos"], ["expenses", "Despesas"], ["pricing", "Precificação"], ["reports", "Relatórios"], ["settings", "Configurações"]
];
const statuses = ["Novo", "Confirmado", "Em producao", "Pronto", "Entregue", "Cancelado"];
const paymentStatuses = ["Pendente", "Pago", "Erro no pagamento", "Cancelado"];
const defaultSettings = { sellerWhatsapp: "5519991365263", feeCredit: 0, feeDebit: 0, feePix: 0, feeCash: 0 };
let state = { orders: [], products: [], categories: [], customers: [], stock: [], expenses: [], payments: [], settings: defaultSettings };
let currentImageBase64 = "";
let orderListenerStarted = false;
let firstOrderSnapshot = true;

const $ = (id) => document.getElementById(id);
const todayKey = () => new Date().toISOString().slice(0, 10);
const number = (value) => Number(value || 0);
let loadingCount = 0;

function orderStatusText(order) {
  return String(order?.status || "Novo").trim().toLowerCase();
}

function countsForRevenue(order) {
  return orderStatusText(order) !== "cancelado";
}

function orderTotal(order) {
  if (order?.total != null) return number(order.total);
  return (order?.items || []).reduce((sum, item) => sum + number(item.price) * number(item.quantity), 0);
}

auth.onAuthStateChanged((user) => {
  if (!user) location.href = "login.html";
  else initAdmin();
});

function initAdmin() {
  renderMenu();
  bindForms();
  setupOrderNotifications();
  loadAll();
}

function renderMenu() {
  $("adminMenu").innerHTML = menu.map(([id, label]) => `<button data-view="${id}" class="${id === "dashboard" ? "active" : ""}">${label}</button>`).join("");
}

function showView(id) {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelectorAll("[data-view]").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === id));
  $(`${id}View`).classList.add("active");
  $("viewTitle").textContent = menu.find((item) => item[0] === id)?.[1] || "Painel";
}

function showLoading() {
  loadingCount += 1;
  document.body.classList.add("is-loading");
  $("loadingOverlay")?.classList.add("show");
  $("loadingOverlay")?.setAttribute("aria-hidden", "false");
  if ($("refreshBtn")) $("refreshBtn").disabled = true;
}

function hideLoading() {
  loadingCount = Math.max(loadingCount - 1, 0);
  if (loadingCount > 0) return;
  document.body.classList.remove("is-loading");
  $("loadingOverlay")?.classList.remove("show");
  $("loadingOverlay")?.setAttribute("aria-hidden", "true");
  if ($("refreshBtn")) $("refreshBtn").disabled = false;
}

function showToast(message) {
  const toast = $("orderToast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 5200);
}

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.18, ctx.currentTime + .02);
    gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + .38);
  } catch (error) {
    console.warn(error);
  }
}

function setupOrderNotifications() {
  if (orderListenerStarted) return;
  orderListenerStarted = true;
  db.collection("orders").orderBy("createdAt", "desc").limit(1).onSnapshot((snap) => {
    if (firstOrderSnapshot) {
      firstOrderSnapshot = false;
      return;
    }
    snap.docChanges().forEach((change) => {
      if (change.type !== "added") return;
      const order = change.doc.data();
      showToast(`Novo pedido recebido: ${order.customerName || "Cliente"} - ${moneyAdmin.format(orderTotal(order))}`);
      playNotificationSound();
      loadAll();
    });
  });
}

function normalizePaymentMethod(method) {
  const text = String(method || "").toLowerCase();
  if (text.includes("crédito") || text.includes("credito") || text === "cartão" || text === "cartao") return "credit";
  if (text.includes("débito") || text.includes("debito")) return "debit";
  if (text.includes("pix")) return "pix";
  if (text.includes("dinheiro")) return "cash";
  return "cash";
}

function feeRateFor(method) {
  const settings = state.settings || defaultSettings;
  const key = normalizePaymentMethod(method);
  if (key === "credit") return number(settings.feeCredit);
  if (key === "debit") return number(settings.feeDebit);
  if (key === "pix") return number(settings.feePix);
  return number(settings.feeCash);
}

function paymentFee(value, method) {
  return number(value) * (feeRateFor(method) / 100);
}

async function loadCollection(name, orderBy = "createdAt", direction = "desc") {
  try {
    const snap = await db.collection(name).orderBy(orderBy, direction).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    const snap = await db.collection(name).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }
}

async function loadSettingsDoc() {
  const doc = await db.collection("settings").doc("business").get();
  return doc.exists ? { ...defaultSettings, ...doc.data() } : defaultSettings;
}

async function loadAll() {
  showLoading();
  try {
    const [orders, products, categories, customers, stock, expenses, payments, settings] = await Promise.all([
      loadCollection("orders"), loadCollection("products"), loadCollection("categories", "order", "asc"), loadCollection("customers", "lastOrder"), loadCollection("stock"), loadCollection("expenses"), loadCollection("payments"), loadSettingsDoc()
    ]);
    state = { orders, products, categories, customers, stock, expenses, payments, settings };
    renderEverything();
  } finally {
    hideLoading();
  }
}

function renderEverything() {
  renderDashboard();
  renderOrders();
  renderCategoryOptions();
  renderProducts();
  renderCategories();
  renderCustomers();
  renderStock();
  renderExpenses();
  renderPayments();
  renderFinance();
  renderSettings();
  renderReports();
  updatePricing();
  updateResale();
}

function dateFromFirestore(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  return new Date(value);
}

function isToday(value) {
  const date = dateFromFirestore(value);
  return date && date.toISOString().slice(0, 10) === todayKey();
}

function isThisMonth(value) {
  const date = dateFromFirestore(value);
  const now = new Date();
  return date && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

function dateKey(value) {
  const date = dateFromFirestore(value);
  return date ? date.toISOString().slice(0, 10) : "";
}

function withinRange(value, start, end) {
  const key = dateKey(value);
  if (!key) return false;
  if (start && key < start) return false;
  if (end && key > end) return false;
  return true;
}

function renderDashboard() {
  const delivered = state.orders.filter(countsForRevenue);
  const todayOrders = delivered.filter((o) => isToday(o.createdAt));
  const monthOrders = delivered.filter((o) => isThisMonth(o.createdAt));
  const dayRevenue = todayOrders.reduce((s, o) => s + orderTotal(o), 0);
  const monthRevenue = monthOrders.reduce((s, o) => s + orderTotal(o), 0);
  const expenses = state.expenses.reduce((s, e) => s + number(e.value), 0);
  const avgTicket = delivered.length ? delivered.reduce((s, o) => s + orderTotal(o), 0) / delivered.length : 0;
  const net = monthRevenue - expenses;
  $("kpis").innerHTML = [
    ["Faturamento hoje", moneyAdmin.format(dayRevenue)], ["Faturamento mes", moneyAdmin.format(monthRevenue)], ["Pedidos hoje", todayOrders.length],
    ["Ticket medio", moneyAdmin.format(avgTicket)], ["Lucro liquido est.", moneyAdmin.format(net)]
  ].map(([label, value]) => `<div class="kpi"><span>${label}</span><strong>${value}</strong></div>`).join("");
  drawRevenueChart(monthOrders);
  drawStatusChart();
  renderTopProducts();
  $("recentOrders").innerHTML = ordersTable(state.orders.slice(0, 6), false);
}

function drawRevenueChart(orders) {
  const canvas = $("revenueChart");
  const ctx = canvas.getContext("2d");
  const width = canvas.width = canvas.offsetWidth * devicePixelRatio;
  const height = canvas.height = 150 * devicePixelRatio;
  ctx.clearRect(0, 0, width, height);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  const values = days.map((day) => orders.filter((o) => {
    const date = dateFromFirestore(o.createdAt);
    return date && date.toISOString().slice(0, 10) === day;
  }).reduce((s, o) => s + orderTotal(o), 0));
  const max = Math.max(...values, 1);
  ctx.strokeStyle = "#c9803c";
  ctx.lineWidth = 4 * devicePixelRatio;
  ctx.beginPath();
  values.forEach((value, i) => {
    const x = (i / (values.length - 1)) * (width - 28 * devicePixelRatio) + 14 * devicePixelRatio;
    const y = height - 18 * devicePixelRatio - (value / max) * (height - 40 * devicePixelRatio);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawStatusChart() {
  const counts = Object.fromEntries(statuses.map((s) => [s, 0]));
  state.orders.forEach((o) => counts[o.status || "Novo"] = (counts[o.status || "Novo"] || 0) + 1);
  const max = Math.max(...Object.values(counts), 1);
  $("statusChart").innerHTML = statuses.map((status) => `<div class="bar-row"><span>${status}</span><div class="bar"><span style="width:${(counts[status] / max) * 100}%"></span></div><strong>${counts[status]}</strong></div>`).join("");
}

function renderTopProducts() {
  const map = {};
  state.orders.filter(countsForRevenue).forEach((order) => (order.items || []).forEach((item) => map[item.name] = (map[item.name] || 0) + number(item.quantity)));
  const rows = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
  $("topProducts").innerHTML = rows.length ? `<table class="table"><tbody>${rows.map(([name, qty]) => `<tr><td>${name}</td><td>${qty} unidades</td></tr>`).join("")}</tbody></table>` : "Sem vendas registradas.";
}

function ordersTable(orders, editable = true) {
  if (!orders.length) return "Nenhum pedido encontrado.";
  return `<table class="table"><thead><tr><th>Cliente</th><th>Itens</th><th>Total</th><th>Pagamento</th><th>Status</th><th>Data</th></tr></thead><tbody>${orders.map((o) => `
    <tr>
      <td><strong>${o.customerName || "-"}</strong><br>${o.customerPhone || ""}<br>${o.customerBusiness || ""}</td>
      <td>${(o.items || []).map((i) => `${i.quantity}x ${i.name}`).join("<br>")}</td>
      <td>${moneyAdmin.format(orderTotal(o))}</td>
      <td>${o.paymentMethod || "-"}</td>
      <td>${editable ? `<select data-order-status="${o.id}">${statuses.map((s) => `<option ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}</select>` : `<span class="pill">${o.status || "Novo"}</span>`}</td>
      <td>${dateFromFirestore(o.createdAt)?.toLocaleDateString("pt-BR") || "-"}</td>
    </tr>`).join("")}</tbody></table>`;
}

function renderOrders() {
  $("ordersList").innerHTML = ordersTable(state.orders);
}

function renderProducts() {
  $("productsList").innerHTML = state.products.length ? `<table class="table"><thead><tr><th>Produto</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th>Status</th><th>Destaque</th><th>Ações</th></tr></thead><tbody>${state.products.map((p) => `
    <tr>
      <td>
        <div class="product-cell">
          ${p.imageBase64 ? `<img class="product-thumb" src="${p.imageBase64}" alt="${p.name}">` : `<div class="product-thumb thumb-fallback">Sem imagem</div>`}
          <div><strong>${p.name}</strong><br>${p.description || ""}</div>
        </div>
      </td>
      <td>${p.category || "-"}</td>
      <td>${moneyAdmin.format(number(p.price))}</td>
      <td>${number(p.stock)}</td>
      <td><span class="pill ${p.active ? "ok" : "low"}">${p.active ? "Ativo" : "Inativo"}</span></td>
      <td><span class="pill ${p.featured ? "ok" : ""}">${p.featured ? "Sim" : "Não"}</span></td>
      <td><div class="row-actions">
        <button class="secondary" data-edit-product="${p.id}">Editar</button>
        <button class="${p.active ? "danger" : "success"}" data-toggle-product="${p.id}">${p.active ? "Desativar" : "Ativar"}</button>
        <button class="secondary" data-toggle-featured="${p.id}">${p.featured ? "Remover destaque" : "Destacar"}</button>
        <button class="danger" data-delete-product="${p.id}">Excluir</button>
      </div></td>
    </tr>`).join("")}</tbody></table>` : "Nenhum produto cadastrado.";
}

function renderCategoryOptions() {
  const fallback = [{ name: "Cones tradicionais" }, { name: "Cones gourmet" }, { name: "Brigadeiros" }, { name: "Kits especiais" }];
  const categories = state.categories.length ? state.categories : fallback;
  $("productCategory").innerHTML = categories
    .filter((category) => category.active !== false)
    .map((category) => `<option>${category.name}</option>`)
    .join("");
}

function renderCategories() {
  $("categoriesList").innerHTML = state.categories.length ? `<table class="table"><thead><tr><th>Categoria</th><th>Ordem</th><th>Status</th><th>Ações</th></tr></thead><tbody>${state.categories.map((category) => `
    <tr>
      <td><strong>${category.name || "-"}</strong></td>
      <td>${number(category.order)}</td>
      <td><span class="pill ${category.active !== false ? "ok" : "low"}">${category.active !== false ? "Ativa" : "Inativa"}</span></td>
      <td><div class="row-actions"><button class="secondary" data-edit-category="${category.id}">Editar</button><button class="danger" data-delete-category="${category.id}">Excluir</button></div></td>
    </tr>`).join("")}</tbody></table>` : "Nenhuma categoria cadastrada.";
}

async function saveCategory(event) {
  event.preventDefault();
  const id = $("categoryId").value;
  const payload = {
    name: $("categoryName").value.trim(),
    order: number($("categoryOrder").value),
    active: $("categoryActive").checked,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  if (!payload.name) return alert("Informe o nome da categoria.");
  if (id) await db.collection("categories").doc(id).update(payload);
  else await db.collection("categories").add({ ...payload, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  event.target.reset();
  $("categoryId").value = "";
  $("categoryActive").checked = true;
  await loadAll();
}

function editCategory(id) {
  const category = state.categories.find((item) => item.id === id);
  if (!category) return;
  $("categoryId").value = category.id;
  $("categoryName").value = category.name || "";
  $("categoryOrder").value = category.order || "";
  $("categoryActive").checked = category.active !== false;
  showView("categories");
  scrollTo({ top: 0, behavior: "smooth" });
}

async function compressImage(file) {
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
  const img = await new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  const max = 900;
  const scale = Math.min(max / img.width, max / img.height, 1);
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", .72);
}

async function saveProduct(event) {
  event.preventDefault();
  const id = $("productId").value;
  const file = $("productImage").files[0];
  if (file) currentImageBase64 = await compressImage(file);
  if (currentImageBase64.length > 850000) return alert("Imagem muito grande. Use uma imagem menor.");
  const payload = {
    name: $("productName").value.trim(),
    category: $("productCategory").value,
    description: $("productDescription").value.trim(),
    price: number($("productPrice").value),
    stock: number($("productStock").value),
    active: $("productActive").checked,
    featured: $("productFeatured").checked,
    imageBase64: currentImageBase64,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  if (!payload.name) return alert("Informe o nome do produto.");
  if (id) await db.collection("products").doc(id).update(payload);
  else await db.collection("products").add({ ...payload, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  event.target.reset();
  $("productId").value = "";
  $("productActive").checked = true;
  currentImageBase64 = "";
  await loadAll();
}

function editProduct(id) {
  const p = state.products.find((item) => item.id === id);
  $("productId").value = p.id;
  $("productName").value = p.name || "";
  $("productCategory").value = p.category || "Cones tradicionais";
  $("productPrice").value = p.price || "";
  $("productStock").value = p.stock || "";
  $("productDescription").value = p.description || "";
  $("productActive").checked = p.active !== false;
  $("productFeatured").checked = !!p.featured;
  currentImageBase64 = p.imageBase64 || "";
  showView("products");
  scrollTo({ top: 0, behavior: "smooth" });
}

function renderCustomers() {
  const term = String($("customerFilter")?.value || "").trim().toLowerCase();
  const start = $("customerStart")?.value || "";
  const end = $("customerEnd")?.value || "";
  const ordersInRange = state.orders.filter((order) => countsForRevenue(order) && withinRange(order.createdAt, start, end));
  const revenueByPhone = {};
  const ordersByPhone = {};

  ordersInRange.forEach((order) => {
    const phone = String(order.customerPhone || "").replace(/\D/g, "");
    if (!phone) return;
    revenueByPhone[phone] = (revenueByPhone[phone] || 0) + orderTotal(order);
    ordersByPhone[phone] = (ordersByPhone[phone] || 0) + 1;
  });

  const rows = state.customers
    .map((customer) => {
      const phone = String(customer.phone || customer.id || "").replace(/\D/g, "");
      return {
        ...customer,
        phone,
        periodOrders: ordersByPhone[phone] || 0,
        periodRevenue: revenueByPhone[phone] || 0
      };
    })
    .filter((customer) => {
      const haystack = `${customer.name || ""} ${customer.phone || ""} ${customer.business || ""}`.toLowerCase();
      return !term || haystack.includes(term);
    })
    .sort((a, b) => b.periodRevenue - a.periodRevenue);

  const periodRevenue = rows.reduce((sum, customer) => sum + customer.periodRevenue, 0);
  const periodOrders = rows.reduce((sum, customer) => sum + customer.periodOrders, 0);
  $("customerRevenueSummary").innerHTML = `<div class="kpis">
    <div class="kpi"><span>Clientes filtrados</span><strong>${rows.length}</strong></div>
    <div class="kpi"><span>Pedidos no período</span><strong>${periodOrders}</strong></div>
    <div class="kpi"><span>Faturamento no período</span><strong>${moneyAdmin.format(periodRevenue)}</strong></div>
  </div>`;

  $("customersList").innerHTML = rows.length ? `<table class="table"><thead><tr><th>Nome</th><th>WhatsApp</th><th>Estabelecimento</th><th>Pedidos total</th><th>Total comprado</th><th>Pedidos período</th><th>Faturamento período</th><th>Último pedido</th></tr></thead><tbody>${rows.map((c) => `
    <tr>
      <td>${c.name || "-"}</td>
      <td>${c.phone || c.id}</td>
      <td>${c.business || "-"}</td>
      <td>${number(c.totalOrders)}</td>
      <td>${moneyAdmin.format(number(c.totalPurchased))}</td>
      <td>${c.periodOrders}</td>
      <td>${moneyAdmin.format(c.periodRevenue)}</td>
      <td>${dateFromFirestore(c.lastOrder)?.toLocaleDateString("pt-BR") || "-"}</td>
    </tr>`).join("")}</tbody></table>` : "Nenhum cliente encontrado.";
}

function renderStock() {
  $("stockList").innerHTML = state.stock.length ? `<table class="table"><thead><tr><th>Item</th><th>Tipo</th><th>Atual</th><th>Minimo</th><th>Status</th></tr></thead><tbody>${state.stock.map((s) => `
    <tr><td>${s.name}</td><td>${s.type}</td><td>${number(s.current)}</td><td>${number(s.min)}</td><td><span class="pill ${number(s.current) <= number(s.min) ? "low" : "ok"}">${number(s.current) <= number(s.min) ? "Baixo" : "OK"}</span></td></tr>`).join("")}</tbody></table>` : "Nenhum estoque registrado.";
}

async function saveStock(event) {
  event.preventDefault();
  await db.collection("stock").add({ name: $("stockName").value.trim(), current: number($("stockCurrent").value), min: number($("stockMin").value), type: $("stockType").value, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  event.target.reset();
  await loadAll();
}

function renderPayments() {
  $("paymentsList").innerHTML = state.payments.length ? `<table class="table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Valor</th><th>Forma</th><th>Taxa</th><th>Líquido</th><th>Status</th><th>Data baixa</th><th>Ações</th></tr></thead><tbody>${state.payments.map((p) => {
    const fee = p.feeValue != null ? number(p.feeValue) : paymentFee(p.value, p.method);
    const net = p.netValue != null ? number(p.netValue) : number(p.value) - fee;
    return `
    <tr>
      <td>${p.orderId || "-"}</td>
      <td>${p.customerName || "-"}</td>
      <td>${moneyAdmin.format(number(p.value))}</td>
      <td>${p.method || "-"}</td>
      <td>${moneyAdmin.format(fee)} (${(p.feeRate != null ? number(p.feeRate) : feeRateFor(p.method)).toFixed(2)}%)</td>
      <td>${moneyAdmin.format(net)}</td>
      <td><select data-payment-status="${p.id}">${paymentStatuses.map((status) => `<option ${status === (p.status || "Pendente") ? "selected" : ""}>${status}</option>`).join("")}</select></td>
      <td>${dateFromFirestore(p.paidAt)?.toLocaleDateString("pt-BR") || "-"}</td>
      <td><div class="row-actions">${p.status === "Pago" ? "" : `<button class="success" data-pay-payment="${p.id}">Dar baixa</button>`}<button class="secondary" data-payment-error="${p.id}">Marcar erro</button></div></td>
    </tr>`;
  }).join("")}</tbody></table>` : "Nenhum recebimento registrado.";
}

async function updatePaymentStatus(paymentId, status) {
  const payment = state.payments.find((item) => item.id === paymentId);
  if (!payment) return;

  const update = {
    status,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (status === "Pago") {
    const feeRate = feeRateFor(payment.method);
    const feeValue = paymentFee(payment.value, payment.method);
    update.paidAt = firebase.firestore.FieldValue.serverTimestamp();
    update.feeRate = feeRate;
    update.feeValue = feeValue;
    update.netValue = number(payment.value) - feeValue;
  } else {
    update.paidAt = firebase.firestore.FieldValue.delete();
    update.feeRate = firebase.firestore.FieldValue.delete();
    update.feeValue = firebase.firestore.FieldValue.delete();
    update.netValue = firebase.firestore.FieldValue.delete();
  }

  await db.collection("payments").doc(payment.id).update(update);
  showToast(status === "Pago" ? "Pagamento baixado com sucesso." : `Pagamento marcado como ${status}.`);
  await loadAll();
}

function renderExpenses() {
  $("expensesList").innerHTML = state.expenses.length ? `<table class="table"><thead><tr><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Data</th><th>Forma</th><th>Observação</th></tr></thead><tbody>${state.expenses.map((e) => `
    <tr><td>${e.description}</td><td>${e.category}</td><td>${moneyAdmin.format(number(e.value))}</td><td>${e.date || "-"}</td><td>${e.method || "-"}</td><td>${e.note || "-"}</td></tr>`).join("")}</tbody></table>` : "Nenhuma despesa registrada.";
}

async function saveExpense(event) {
  event.preventDefault();
  await db.collection("expenses").add({
    description: $("expenseDescription").value.trim(), category: $("expenseCategory").value, value: number($("expenseValue").value),
    date: $("expenseDate").value || todayKey(), method: $("expenseMethod").value.trim(), note: $("expenseNote").value.trim(), createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  event.target.reset();
  await loadAll();
}

function renderFinance() {
  const gross = state.orders.filter(countsForRevenue).reduce((s, o) => s + orderTotal(o), 0);
  const paid = state.payments.filter((p) => p.status === "Pago").reduce((s, p) => s + number(p.value), 0);
  const paymentFees = state.payments.filter((p) => p.status === "Pago").reduce((s, p) => s + number(p.feeValue), 0);
  const expenses = state.expenses.reduce((s, e) => s + number(e.value), 0);
  const net = gross - expenses - paymentFees;
  const margin = gross ? (net / gross) * 100 : 0;
  $("financeBox").innerHTML = `<div class="kpis">
    <div class="kpi"><span>Faturamento bruto</span><strong>${moneyAdmin.format(gross)}</strong></div>
    <div class="kpi"><span>Recebimentos pagos</span><strong>${moneyAdmin.format(paid)}</strong></div>
    <div class="kpi"><span>Despesas totais</span><strong>${moneyAdmin.format(expenses)}</strong></div>
    <div class="kpi"><span>Taxas de pagamento</span><strong>${moneyAdmin.format(paymentFees)}</strong></div>
    <div class="kpi"><span>Lucro liquido</span><strong>${moneyAdmin.format(net)}</strong></div>
    <div class="kpi"><span>Margem de lucro</span><strong>${margin.toFixed(1)}%</strong></div>
  </div>`;
}

function renderReports() {
  const start = $("reportStart")?.value || "";
  const end = $("reportEnd")?.value || "";
  const orders = state.orders.filter((order) => withinRange(order.createdAt, start, end));
  const payments = state.payments.filter((payment) => withinRange(payment.paidAt || payment.createdAt, start, end));
  const expenses = state.expenses.filter((expense) => {
    const key = expense.date || dateKey(expense.createdAt);
    if (!key) return false;
    if (start && key < start) return false;
    if (end && key > end) return false;
    return true;
  });
  const gross = orders.filter(countsForRevenue).reduce((s, o) => s + orderTotal(o), 0);
  const paid = payments.filter((p) => p.status === "Pago").reduce((s, p) => s + number(p.value), 0);
  const fees = payments.filter((p) => p.status === "Pago").reduce((s, p) => s + number(p.feeValue), 0);
  const expenseTotal = expenses.reduce((s, e) => s + number(e.value), 0);
  const net = gross - expenseTotal - fees;
  const stockLow = state.stock.filter((s) => number(s.current) <= number(s.min)).length;
  $("reportsBox").innerHTML = `<div class="kpis">
    <div class="kpi"><span>Pedidos no período</span><strong>${orders.length}</strong></div>
    <div class="kpi"><span>Faturamento bruto</span><strong>${moneyAdmin.format(gross)}</strong></div>
    <div class="kpi"><span>Recebido pago</span><strong>${moneyAdmin.format(paid)}</strong></div>
    <div class="kpi"><span>Taxas</span><strong>${moneyAdmin.format(fees)}</strong></div>
    <div class="kpi"><span>Despesas</span><strong>${moneyAdmin.format(expenseTotal)}</strong></div>
    <div class="kpi"><span>Lucro líquido est.</span><strong>${moneyAdmin.format(net)}</strong></div>
    <div class="kpi"><span>Alertas de estoque</span><strong>${stockLow}</strong></div>
  </div>`;
}

function renderSettings() {
  const settings = state.settings || defaultSettings;
  $("sellerWhatsapp").value = settings.sellerWhatsapp || "";
  $("feeCredit").value = number(settings.feeCredit);
  $("feeDebit").value = number(settings.feeDebit);
  $("feePix").value = number(settings.feePix);
  $("feeCash").value = number(settings.feeCash);
}

async function saveSettings(event) {
  event.preventDefault();
  const payload = {
    sellerWhatsapp: String($("sellerWhatsapp").value || "").replace(/\D/g, ""),
    feeCredit: number($("feeCredit").value),
    feeDebit: number($("feeDebit").value),
    feePix: number($("feePix").value),
    feeCash: number($("feeCash").value),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  await db.collection("settings").doc("business").set(payload, { merge: true });
  state.settings = { ...state.settings, ...payload };
  showToast("Configurações salvas.");
  renderFinance();
  renderReports();
}

function updatePricing() {
  const total = number($("costIngredients").value) + number($("costPackage").value) + number($("costLabor").value) + number($("costOther").value);
  const margin = number($("desiredMargin").value);
  const price = total / (1 - margin / 100 || 1);
  const profit = price - total;
  $("pricingResult").innerHTML = `<div><span>Custo total</span><strong>${moneyAdmin.format(total)}</strong></div><div><span>Preço sugerido</span><strong>${moneyAdmin.format(price)}</strong></div><div><span>Lucro estimado</span><strong>${moneyAdmin.format(profit)}</strong></div><div><span>Margem aplicada</span><strong>${margin.toFixed(1)}%</strong></div>`;
}

function updateResale() {
  const cost = number($("resaleCost").value);
  const direct = cost / (1 - number($("directMargin").value) / 100 || 1);
  const resale = cost * 1.35;
  const partnerSale = resale / (1 - number($("partnerMargin").value) / 100 || 1);
  $("resaleResult").innerHTML = `<div><span>Preço venda direta</span><strong>${moneyAdmin.format(direct)}</strong></div><div><span>Lucro direto</span><strong>${moneyAdmin.format(direct - cost)}</strong></div><div><span>Preço revenda</span><strong>${moneyAdmin.format(resale)}</strong></div><div><span>Lucro revendedor</span><strong>${moneyAdmin.format(partnerSale - resale)}</strong></div>`;
}

function bindForms() {
  $("adminMenu").addEventListener("click", (event) => event.target.dataset.view && showView(event.target.dataset.view));
  $("logoutBtn").addEventListener("click", () => auth.signOut());
  $("refreshBtn").addEventListener("click", loadAll);
  $("productForm").addEventListener("submit", saveProduct);
  $("categoryForm").addEventListener("submit", saveCategory);
  $("settingsForm").addEventListener("submit", saveSettings);
  $("stockForm").addEventListener("submit", saveStock);
  $("expenseForm").addEventListener("submit", saveExpense);
  $("reportStart").addEventListener("change", renderReports);
  $("reportEnd").addEventListener("change", renderReports);
  $("reportToday").addEventListener("click", () => {
    $("reportStart").value = todayKey();
    $("reportEnd").value = todayKey();
    renderReports();
  });
  $("reportMonth").addEventListener("click", () => {
    const now = new Date();
    $("reportStart").value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    $("reportEnd").value = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    renderReports();
  });
  $("customerFilter").addEventListener("input", renderCustomers);
  $("customerStart").addEventListener("change", renderCustomers);
  $("customerEnd").addEventListener("change", renderCustomers);
  $("customerToday").addEventListener("click", () => {
    $("customerStart").value = todayKey();
    $("customerEnd").value = todayKey();
    renderCustomers();
  });
  $("customerMonth").addEventListener("click", () => {
    const now = new Date();
    $("customerStart").value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    $("customerEnd").value = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    renderCustomers();
  });
  document.addEventListener("change", async (event) => {
    if (event.target.dataset.orderStatus) {
      await db.collection("orders").doc(event.target.dataset.orderStatus).update({ status: event.target.value, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      await loadAll();
    }
    if (event.target.dataset.paymentStatus) await updatePaymentStatus(event.target.dataset.paymentStatus, event.target.value);
    if (["costIngredients", "costPackage", "costLabor", "costOther", "desiredMargin"].includes(event.target.id)) updatePricing();
    if (["resaleCost", "directMargin", "partnerMargin"].includes(event.target.id)) updateResale();
  });
  document.addEventListener("input", (event) => {
    if (["costIngredients", "costPackage", "costLabor", "costOther", "desiredMargin"].includes(event.target.id)) updatePricing();
    if (["resaleCost", "directMargin", "partnerMargin"].includes(event.target.id)) updateResale();
  });
  document.addEventListener("click", async (event) => {
    if (event.target.dataset.editProduct) editProduct(event.target.dataset.editProduct);
    if (event.target.dataset.editCategory) editCategory(event.target.dataset.editCategory);
    if (event.target.dataset.toggleProduct) {
      const product = state.products.find((item) => item.id === event.target.dataset.toggleProduct);
      await db.collection("products").doc(product.id).update({ active: !product.active, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      await loadAll();
    }
    if (event.target.dataset.toggleFeatured) {
      const product = state.products.find((item) => item.id === event.target.dataset.toggleFeatured);
      await db.collection("products").doc(product.id).update({ featured: !product.featured, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      await loadAll();
    }
    if (event.target.dataset.payPayment) await updatePaymentStatus(event.target.dataset.payPayment, "Pago");
    if (event.target.dataset.paymentError) await updatePaymentStatus(event.target.dataset.paymentError, "Erro no pagamento");
    if (event.target.dataset.deleteProduct && confirm("Excluir este produto?")) {
      await db.collection("products").doc(event.target.dataset.deleteProduct).delete();
      await loadAll();
    }
    if (event.target.dataset.deleteCategory && confirm("Excluir esta categoria? Os produtos que usam essa categoria não serão apagados.")) {
      await db.collection("categories").doc(event.target.dataset.deleteCategory).delete();
      await loadAll();
    }
  });
}

