# Shopee va TikTok Integration Audit

## Muc tieu

Tai lieu nay tong hop cac rang buoc can duoc ton trong khi tich hop dang video va gan san pham len Shopee/TikTok.

## Nguyen tac van hanh

- Uu tien API chinh thong.
- Khong xem browser bot hay RPA la giai phap mac dinh.
- Bat buoc co human-in-the-loop cho luong co rui ro cao.
- Luu vet day du yeu cau publish, account, payload, response va retry.

## Shopee

### Kha nang kha thi

- Dong bo thong tin san pham neu tai khoan du dieu kien Open Platform.
- Upload media/video thong qua media flow chinh thong.
- Gan video vao ngu canh san pham neu API cua thi truong cho phep.
- Quan ly access token, refresh token, retry va polling ket qua xu ly media.

### Rui ro va gioi han

- Khac biet theo thi truong, loai tai khoan va quyen ung dung.
- Rate limit va token expiration can duoc xu ly tu dau.
- Publish khong nen duoc thiet ke theo cach phu thuoc vao mot endpoint duy nhat.
- Mapping video voi san pham co the khong dong nhat giua cac khu vuc.

### De xuat ky thuat

- Tao `ShopeeAdapter` dung capabiliy-based design:
  - `uploadAsset`
  - `attachVideoToProduct`
  - `syncPublishStatus`
  - `refreshAccessToken`
- Luu bang `channel_accounts`, `channel_capabilities`, `publish_attempts`.

## TikTok va TikTok Shop

### Kha nang kha thi

- OAuth cho tai khoan duoc cap quyen.
- Upload video theo huong draft/inbox truoc.
- Direct post chi nen bat sau khi da co quy trinh policy review ro rang.
- Neu co Dieu kien TikTok Shop partner, co the them luong gan san pham/shoppable content o phase sau.

### Rui ro va gioi han

- Gioi han app review, permission scopes va moi truong production.
- Chinh sach synthetic media, affiliate disclosure va claim san pham co the thay doi.
- Khong phai seller/creator nao cung co cung bo API.
- Organic posting, Shop posting va Ads la ba bai toan khac nhau.

### De xuat ky thuat

- Tao `TikTokAdapter` voi cac capability:
  - `uploadDraft`
  - `publishApprovedDraft`
  - `validateDisclosure`
  - `syncPostStatus`
- Tien trinh publish phai co `compliance_checklist` va `manual_approval_gate`.

## Facebook / Meta (bo sung)

- **Kha thi:** dang noi dung (Page, Reels, v.v.) phu thuoc **Graph API**, quyen app va loai tai khoan; trong repo dung **cung mo hinh BFF** nhu TikTok/Shopee (`FACEBOOK_*` env, hop dong [provider-bff-contract.md](./provider-bff-contract.md)).
- **Rui ro:** policy quang cao/affiliate (#ad), gioi han rate, khac biet ca nhan vs Page.
- **De xuat:** BFF map `caption`, `hashtags`, `affiliateLink` sang payload Graph; khong gia dinh mot endpoint publish duy nhat.

## Link san pham va attribution

- Tach rieng `product_mapping` khoi `affiliate_link`.
- Moi publish job phai luu:
  - nguon san pham
  - kenh dich
  - caption
  - hashtags
  - disclosure text
  - tracking params
- Bao cao attribution phai hop nhat tu nhieu nguon thay vi gia dinh mot mo hinh ROAS duy nhat.

## Operating model khuyen nghi

### Phase dau

- Shopee: upload va dong bo trang thai media o muc duoc phep.
- TikTok: uu tien draft/inbox va cho reviewer xac nhan.
- Fallback: xuat file video, caption, hashtag, link de operator dang tay neu can.

### Phase sau

- Bat direct post cho tai khoan da qua xac minh.
- Mo rong product tagging khi doi tac TikTok Shop cho phep.
- Bo sung canh bao account safety, token sap het han, publish fail bat thuong.

## Ket luan

Huong kha thi nhat cho san pham la tu dong hoa manh phan generate, review, packaging va scheduling; con publish can duoc xay theo mo hinh capabiliy va co fallback manual de tranh phu thuoc vao mot gia dinh API ly tuong.
