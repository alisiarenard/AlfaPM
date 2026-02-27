let _kaitenDomain: string = 'feature.kaiten.ru';
let _domainLoaded = false;

export function setKaitenDomain(domain: string) {
  _kaitenDomain = domain;
  _domainLoaded = true;
}

export function isKaitenDomainLoaded(): boolean {
  return _domainLoaded;
}

export function getKaitenDomain(): string {
  if (typeof process !== 'undefined' && process.env) {
    return process.env.KAITEN_DOMAIN || process.env.VITE_KAITEN_DOMAIN || _kaitenDomain;
  }
  return _kaitenDomain;
}

export function getKaitenCardUrl(
  spaceId: number,
  cardId: number,
  archived: boolean = false
): string {
  const domain = getKaitenDomain();
  const cardPath = archived ? 'archive/card' : 'boards/card';
  return `https://${domain}/space/${spaceId}/${cardPath}/${cardId}`;
}
