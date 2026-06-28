const moneyAdmin = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const menu = [
  ["dashboard", "Dashboard"], ["orders", "Pedidos"], ["products", "Produtos"], ["customers", "Clientes"], ["stock", "Estoque"],
  ["finance", "Financeiro"], ["payments", "Recebimentos"], ["expenses", "Despesas"], ["pricing", "Precificação"], ["reports", "Relatórios"], ["settings", "Configurações"]
];
const statuses = ["Novo", "Confirmado", "Em producao", "Pronto", "Entregue", "Cancelado"];
let state = { orders: [], products: [], customers: [], stock: [], expenses: [], payments: [] };
let currentImageBase64 = "";

const $ = (id) => document.getElementById(id);
const todayKey = () => new Date().toISOString().slice(0, 10);
const number = (value) => Number(value || 0);

auth.onAuthStateChanged((user) => {
  if (!user) location.href = "login.html";
  else initAdmin();
});

function initAdmin() {
  renderMenu();
  bindForms();
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

async function loadCollection(name, orderBy = "createdAt") {
  try {
    const snap = await db.collection(name).orderBy(orderBy, "desc").get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    const snap = await db.collection(name).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }
}

async function loadAll() {
  const [orders, products, customers, stock, expenses, payments] = await Promise.all([
    loadCollection("orders"), loadCollection("products"), loadCollection("customers", "lastOrder"), loadCollection("stock"), loadCollection("expenses"), loadCollection("payments")
  ]);
  state = { orders, products, customers, stock, expenses, payments };
  renderEverything();
}

function renderEverything() {
  renderDashboard();
  renderOrders();
  renderProducts();
  renderCustomers();
  renderStock();
  renderExpenses();
  renderPayments();
  renderFinance();
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

function renderDashboard() {
  const delivered = state.orders.filter((o) => o.status !== "Cancelado");
  const todayOrders = delivered.filter((o) => isToday(o.createdAt));
  const monthOrders = delivered.filter((o) => isThisMonth(o.createdAt));
  const dayRevenue = todayOrders.reduce((s, o) => s + number(o.total), 0);
  const monthRevenue = monthOrders.reduce((s, o) => s + number(o.total), 0);
  const expenses = state.expenses.reduce((s, e) => s + number(e.value), 0);
  const avgTicket = delivered.length ? delivered.reduce((s, o) => s + number(o.total), 0) / delivered.length : 0;
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
  }).reduce((s, o) => s + number(o.total), 0));
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
  state.orders.forEach((order) => (order.items || []).forEach((item) => map[item.name] = (map[item.name] || 0) + number(item.quantity)));
  const rows = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
  $("topProducts").innerHTML = rows.length ? `<table class="table"><tbody>${rows.map(([name, qty]) => `<tr><td>${name}</td><td>${qty} unidades</td></tr>`).join("")}</tbody></table>` : "Sem vendas registradas.";
}

function ordersTable(orders, editable = true) {
  if (!orders.length) return "Nenhum pedido encontrado.";
  return `<table class="table"><thead><tr><th>Cliente</th><th>Itens</th><th>Total</th><th>Pagamento</th><th>Status</th><th>Data</th></tr></thead><tbody>${orders.map((o) => `
    <tr>
      <td><strong>${o.customerName || "-"}</strong><br>${o.customerPhone || ""}<br>${o.customerBusiness || ""}</td>
      <td>${(o.items || []).map((i) => `${i.quantity}x ${i.name}`).join("<br>")}</td>
      <td>${moneyAdmin.format(number(o.total))}</td>
      <td>${o.paymentMethod || "-"}</td>
      <td>${editable ? `<select data-order-status="${o.id}">${statuses.map((s) => `<option ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}</select>` : `<span class="pill">${o.status || "Novo"}</span>`}</td>
      <td>${dateFromFirestore(o.createdAt)?.toLocaleDateString("pt-BR") || "-"}</td>
    </tr>`).join("")}</tbody></table>`;
}

function renderOrders() {
  $("ordersList").innerHTML = ordersTable(state.orders);
}

function renderProducts() {
  $("productsList").innerHTML = state.products.length ? `<table class="table"><thead><tr><th>Produto</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th>Status</th><th>Ações</th></tr></thead><tbody>${state.products.map((p) => `
    <tr>
      <td><strong>${p.name}</strong><br>${p.description || ""}</td>
      <td>${p.category || "-"}</td>
      <td>${moneyAdmin.format(number(p.price))}</td>
      <td>${number(p.stock)}</td>
      <td><span class="pill ${p.active ? "ok" : "low"}">${p.active ? "Ativo" : "Inativo"}</span></td>
      <td><div class="row-actions"><button class="secondary" data-edit-product="${p.id}">Editar</button><button class="danger" data-delete-product="${p.id}">Excluir</button></div></td>
    </tr>`).join("")}</tbody></table>` : "Nenhum produto cadastrado.";
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
  $("customersList").innerHTML = state.customers.length ? `<table class="table"><thead><tr><th>Nome</th><th>WhatsApp</th><th>Estabelecimento</th><th>Pedidos</th><th>Total comprado</th><th>Ultimo pedido</th></tr></thead><tbody>${state.customers.map((c) => `
    <tr><td>${c.name || "-"}</td><td>${c.phone || c.id}</td><td>${c.business || "-"}</td><td>${number(c.totalOrders)}</td><td>${moneyAdmin.format(number(c.totalPurchased))}</td><td>${dateFromFirestore(c.lastOrder)?.toLocaleDateString("pt-BR") || "-"}</td></tr>`).join("")}</tbody></table>` : "Nenhum cliente encontrado.";
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
  $("paymentsList").innerHTML = state.payments.length ? `<table class="table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Valor</th><th>Forma</th><th>Status</th><th>Data</th></tr></thead><tbody>${state.payments.map((p) => `
    <tr><td>${p.orderId || "-"}</td><td>${p.customerName || "-"}</td><td>${moneyAdmin.format(number(p.value))}</td><td>${p.method || "-"}</td><td><span class="pill">${p.status || "Pendente"}</span></td><td>${dateFromFirestore(p.createdAt)?.toLocaleDateString("pt-BR") || "-"}</td></tr>`).join("")}</tbody></table>` : "Nenhum recebimento registrado.";
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
  const gross = state.orders.filter((o) => o.status !== "Cancelado").reduce((s, o) => s + number(o.total), 0);
  const paid = state.payments.filter((p) => p.status === "Pago").reduce((s, p) => s + number(p.value), 0);
  const expenses = state.expenses.reduce((s, e) => s + number(e.value), 0);
  const net = gross - expenses;
  const margin = gross ? (net / gross) * 100 : 0;
  $("financeBox").innerHTML = `<div class="kpis">
    <div class="kpi"><span>Faturamento bruto</span><strong>${moneyAdmin.format(gross)}</strong></div>
    <div class="kpi"><span>Recebimentos pagos</span><strong>${moneyAdmin.format(paid)}</strong></div>
    <div class="kpi"><span>Despesas totais</span><strong>${moneyAdmin.format(expenses)}</strong></div>
    <div class="kpi"><span>Lucro liquido</span><strong>${moneyAdmin.format(net)}</strong></div>
    <div class="kpi"><span>Margem de lucro</span><strong>${margin.toFixed(1)}%</strong></div>
  </div>`;
}

function renderReports() {
  const orders = state.orders.length;
  const customers = state.customers.length;
  const stockLow = state.stock.filter((s) => number(s.current) <= number(s.min)).length;
  $("reportsBox").innerHTML = `<div class="kpis"><div class="kpi"><span>Total de pedidos</span><strong>${orders}</strong></div><div class="kpi"><span>Clientes</span><strong>${customers}</strong></div><div class="kpi"><span>Alertas de estoque</span><strong>${stockLow}</strong></div></div>`;
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
  $("stockForm").addEventListener("submit", saveStock);
  $("expenseForm").addEventListener("submit", saveExpense);
  document.addEventListener("change", async (event) => {
    if (event.target.dataset.orderStatus) {
      await db.collection("orders").doc(event.target.dataset.orderStatus).update({ status: event.target.value, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      await loadAll();
    }
    if (["costIngredients", "costPackage", "costLabor", "costOther", "desiredMargin"].includes(event.target.id)) updatePricing();
    if (["resaleCost", "directMargin", "partnerMargin"].includes(event.target.id)) updateResale();
  });
  document.addEventListener("input", (event) => {
    if (["costIngredients", "costPackage", "costLabor", "costOther", "desiredMargin"].includes(event.target.id)) updatePricing();
    if (["resaleCost", "directMargin", "partnerMargin"].includes(event.target.id)) updateResale();
  });
  document.addEventListener("click", async (event) => {
    if (event.target.dataset.editProduct) editProduct(event.target.dataset.editProduct);
    if (event.target.dataset.deleteProduct && confirm("Excluir este produto?")) {
      await db.collection("products").doc(event.target.dataset.deleteProduct).delete();
      await loadAll();
    }
  });
}

