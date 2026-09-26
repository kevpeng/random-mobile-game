import { render } from 'preact';
import { App } from './App';
import { initHaptics } from './shared/haptics';
import { preventZoom } from './shared/noZoom';
import { initUpdates } from './shared/update';
import './styles.css';

preventZoom();
initHaptics();
render(<App />, document.getElementById('app')!);
initUpdates();
