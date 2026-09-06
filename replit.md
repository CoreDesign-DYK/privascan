# PrivaScan

Privacy-first mobile document scanner PWA. Scans, processes, and exports PDF/JPEG entirely on-device — no server, no cloud upload.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- Android와 iOS는 동일한 PrivaScan 내부 `getUserMedia` 실시간 카메라를 사용한다. 시스템 카메라 앱으로 전환하는 촬영 경로는 사용하지 않는다.
- 두 모바일 플랫폼은 동일한 스캐너 UI, 실시간 감지, 자동 촬영, 보정, JPEG 품질 및 모바일 메모리 한도를 사용한다.
- Capacitor 네이티브 기능은 파일 저장과 공유에 사용하고, 문서 촬영과 경계 감지는 WebView 내부에서 처리한다.
- 모든 스캔 모드는 앱 UI를 세로 방향으로 고정한다. 사용자가 휴대폰을 눕혀도 컨트롤은 회전하지 않으며, 넓은 문서는 고정 UI 안의 가로 가이드와 검출 결과로 촬영한다.
- Book의 중앙선은 고정 페이지 분할선이 아니라 실제 제본선 감지 안내선이다.
- Android 셔터음은 촬영 성공 시에만 재생하고 시스템의 일반/진동/무음 상태를 따른다.

## Product

- Android와 iPhone에서 같은 화면과 사용법으로 Document, Book, Presentation, ID Card 스캔을 제공한다.
- 촬영 전 실시간 경계 감지와 자동 촬영을 제공하고, 저장 전 정확한 고해상도 프레임을 다시 검증한다.

## Versioning

버전 파일: `artifacts/web-scanner/package.json` → `"version"` 필드 **한 곳만** 수정하면 앱 내 모든 표시(`v1.0.0`)에 자동 반영됩니다.  
(Vite `define.__APP_VERSION__` 으로 빌드 시 주입 → `__APP_VERSION__` 전역 상수)

### 버전 규칙 (Semantic Versioning: MAJOR.MINOR.PATCH)

| 자리 | 올리는 조건 | 예시 |
|---|---|---|
| **MAJOR** (첫째 자리) | 기존 사용자 데이터 구조 변경, 호환 불가능한 기능 제거, 앱 전면 재설계 | `1.0.0` → `2.0.0` |
| **MINOR** (둘째 자리) | 새 기능 추가 (하위 호환 유지): 신규 메뉴, 새 내보내기 형식, 클라우드 연동 등 | `1.0.0` → `1.1.0` |
| **PATCH** (셋째 자리) | 버그 수정, UI 미세 조정, 텍스트 변경, 성능 개선 | `1.0.0` → `1.0.1` |

### 버전 올리는 방법

```
artifacts/web-scanner/package.json
  "version": "1.0.1"  ← 이 한 줄만 수정
```

앱 재시작 없이 Vite HMR이 즉시 반영합니다.

## User preferences

- 개발 중인 앱의 모든 사용자 표시 문구, 안내, 오류 메시지, OCR 기본 언어는 영어만 고려한다.
- 다국어 지원은 핵심 기능이 완성된 뒤 별도 단계에서 추가하며, 개발 중에는 번역이나 다국어 구조 확장을 진행하지 않는다.
- 웹 UI와 스캔 로직은 `PrivaScan Dev` Live Reload 앱으로 즉시 확인한다. 권한, 네이티브 코드, Capacitor 플러그인, 저장·공유 방식, 출시 후보 변경은 재빌드가 필요하므로 작업 시점마다 사용자에게 안내한다.

## Gotchas

- Android Live Reload 주소는 `android/app/src/debug/assets/capacitor.config.json`에만 있으며 Debug APK에만 포함된다. iOS Live Reload는 `CAPACITOR_LIVE_RELOAD_URL`이 있는 Debug 동기화에서만 활성화한다. Release는 반드시 로컬 `dist/public`을 포함해야 한다.
- Android Debug 앱 ID는 `com.privascan.app.dev`, iOS Debug Bundle ID는 `com.privascan.app.dev`이며 표시 이름은 `PrivaScan Dev`다. Release는 기존 `com.privascan.app`과 `PrivaScan`을 유지한다.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
