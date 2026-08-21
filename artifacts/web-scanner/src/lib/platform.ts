/**
 * platform.ts
 * Capacitor(Android/iOS)와 웹앱(브라우저)을 구분하는 유틸리티.
 * 카메라·파일·공유 등 플랫폼별 분기에 사용.
 */

/** Capacitor 네이티브 런타임에서 실행 중인지 여부 */
export function isNative(): boolean {
  return typeof (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor?.isNativePlatform === 'function'
    && (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor!.isNativePlatform!();
}

/** Android 앱에서 실행 중인지 여부 */
export function isAndroid(): boolean {
  if (!isNative()) return false;
  const cap = (window as Window & { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  return cap?.getPlatform?.() === 'android';
}

/** iOS 앱에서 실행 중인지 여부 */
export function isIOS(): boolean {
  if (!isNative()) return false;
  const cap = (window as Window & { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  return cap?.getPlatform?.() === 'ios';
}

/** 웹 브라우저에서 실행 중인지 여부 */
export function isWeb(): boolean {
  return !isNative();
}
