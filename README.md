# Choco RB

Sistema completo de cardapio digital, encomendas via WhatsApp e painel administrativo para cones de chocolate, brigadeiros, kits especiais e doces artesanais.

## Arquivos

- `index.html`: cardapio publico e carrinho.
- `login.html`: login administrativo com Firebase Authentication.
- `dashboard.html`: painel administrativo.
- `style.css`, `app.js`: estilos e logica da area publica.
- `admin.css`, `admin.js`: estilos e logica do painel.
- `firebase-config.js`: credenciais do Firebase.
- `firestore.rules`, `firestore.indexes.json`, `firebase.json`: configuracao Firebase.

## Logo

Coloque o arquivo `logo.png` na raiz do projeto. O sistema ja procura esse arquivo automaticamente no topo do cardapio, login e painel.

## WhatsApp do vendedor

Altere o numero na constante `SELLER_WHATSAPP`, no arquivo `app.js`.

```js
const SELLER_WHATSAPP = "5511999999999";
```

Use DDI + DDD + numero, somente digitos.

## Firebase

1. Ative Firebase Authentication com provedor E-mail/Senha.
2. Crie o usuario administrador em Authentication.
3. Ative Firestore Database.
4. Publique as regras de `firestore.rules`.
5. Publique os indices de `firestore.indexes.json`, se solicitado pelo Firebase.

## Imagens

O painel aceita upload de imagem no cadastro de produtos, comprime no navegador e salva o resultado em Base64 no campo `imageBase64` do Firestore. Nao usa Firebase Storage.

## Colecoes

- `products`
- `orders`
- `customers`
- `stock`
- `expenses`
- `payments`
- `settings`

## Deploy

O projeto esta pronto para subir na raiz do GitHub Pages ou Firebase Hosting.
