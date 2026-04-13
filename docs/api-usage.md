# API Usage

## Dang nhap

```bash
curl -X POST http://localhost:4000/auth/login \
  -H "content-type: application/json" \
  -d '{
    "email": "admin@appaffilate.local",
    "password": "admin123",
    "tenantId": "tenant_demo"
  }'
```

## Tao product

```bash
curl -X POST http://localhost:4000/products \
  -H "content-type: application/json" \
  -H "authorization: Bearer <TOKEN>" \
  -d '{
    "sku": "SKU-NEW-01",
    "title": "New Product",
    "description": "Sample product",
    "price": 99000,
    "channels": ["shopee", "tiktok"]
  }'
```

## Tao asset

```bash
curl -X POST http://localhost:4000/assets \
  -H "content-type: application/json" \
  -H "authorization: Bearer <TOKEN>" \
  -d '{
    "productId": "<PRODUCT_ID>",
    "kind": "image",
    "storageKey": "products/new/hero.jpg",
    "mimeType": "image/jpeg",
    "checksum": "hero-checksum",
    "title": "Hero image"
  }'
```

## Tao project

```bash
curl -X POST http://localhost:4000/projects \
  -H "content-type: application/json" \
  -H "authorization: Bearer <TOKEN>" \
  -d '{
    "productId": "<PRODUCT_ID>",
    "templateId": "template_tiktok_ugc",
    "title": "Launch short video",
    "status": "draft"
  }'
```
