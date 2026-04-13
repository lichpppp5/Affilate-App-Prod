# Affiliate và đăng chéo kênh (TikTok, Facebook, Shopee)

## Mục tiêu sản phẩm

Bạn lấy **link affiliate** (hoặc deep link) từ chương trình của nhà bán, gắn vào **product** trong AppAffilate, rồi khi tạo **publish job** hệ thống đưa **caption, hashtag, disclosure, affiliate link** sang worker. Worker gọi URL `*_PUBLISH_URL` (mock mặc định hoặc BFF của bạn) để map sang API thật của từng nền tảng.

**Hoa hồng** không được tính trong repo này: nó do nền tảng affiliate (cookie, thiết bị, chính sách) và chương trình đối tác quyết định. AppAffilate chỉ giúp **chuẩn hóa dữ liệu** và **luồng đăng**.

## Đã tích hợp trong code

- `products`: `affiliate_source_url`, `affiliate_program` (lưu link/chương trình tham chiếu).
- `channel_accounts.channel`: thêm `facebook` (cùng `tiktok`, `shopee`).
- Web **Products**: form nhập affiliate; **Publishing**: chọn `facebook`, ô **Affiliate link** (khi tạo job mới, nếu product có `affiliateSourceUrl` và ô link đang trống thì tự điền).
- Worker gửi thêm trong body publish: `caption`, `hashtags`, `affiliateLink` (xem [provider-bff-contract.md](./provider-bff-contract.md)).
- Mock Facebook: yêu cầu `affiliateLink` (400 nếu thiếu). TikTok mock vẫn yêu cầu `disclosureText`.

## Tuân thủ và rủi ro

- **Disclosure**: nhiều thị trường yêu cầu gắn nhãn quảng cáo (#ad, #quảngcáo, v.v.) — TikTok mock đang enforce; Facebook bạn nên tự đặt trong caption/disclosure theo policy Meta.
- **API Facebook**: Graph API (Page post, Reels, v.v.) khác schema với body JSON nội bộ; production nên dùng **BFF** trỏ `FACEBOOK_PUBLISH_URL` giống TikTok/Shopee.
- **Chính sách nền tảng**: spam link, vi phạm brand safety, hoặc dùng token sai scope có thể khóa tài khoản — không thuộc phạm vi code.

## Biến môi trường

Giống pattern TikTok/Shopee: `FACEBOOK_OAUTH_AUTHORIZE_URL`, `FACEBOOK_OAUTH_TOKEN_URL`, `FACEBOOK_PUBLISH_URL`, `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`. Chi tiết: [.env.example](../.env.example), [env-production.md](./env-production.md).

## Seed demo

Sau `db:seed`, product **Glow Serum** có link affiliate demo và kênh `facebook`; có sẵn `channel_demo_facebook` để thử publish (nhớ điền affiliate link trên job nếu tạo tay).
