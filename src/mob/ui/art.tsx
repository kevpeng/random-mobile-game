// Small UI art for Mob (hand-authored SVGs in assets-src/mob/ui; see docs/mob-art.md).
import coinUrl from '../../../assets-src/mob/ui/coin.svg';
import cardUrl from '../../../assets-src/mob/ui/mob-card.svg';
import boostUrl from '../../../assets-src/mob/ui/up-boost.svg';
import champUrl from '../../../assets-src/mob/ui/up-champ.svg';
import fireUrl from '../../../assets-src/mob/ui/up-fire.svg';
import shotUrl from '../../../assets-src/mob/ui/up-shot.svg';
import type { UpgradeKey } from '../sim/economy';

/** The coin icon, sized to sit inline with text. */
export function Coin({ size = 20 }: { size?: number }) {
  return <img class="coin" src={coinUrl} width={size} height={size} alt="" aria-hidden="true" draggable={false} />;
}

const UPGRADE_ICONS: Record<UpgradeKey, string> = { fire: fireUrl, shot: shotUrl, champ: champUrl, boost: boostUrl };

export function UpgradeIcon({ upgrade }: { upgrade: UpgradeKey }) {
  return <img class="mob__upicon" src={UPGRADE_ICONS[upgrade]} width={44} height={44} alt="" aria-hidden="true" draggable={false} />;
}

/** Home-screen card art. */
export function MobCardArt() {
  return <img class="art art--mob" src={cardUrl} width={84} height={84} alt="" aria-hidden="true" draggable={false} />;
}
