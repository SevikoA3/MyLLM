import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Screen } from './components';

describe('Screen', () => {
  it('selalu memenuhi tinggi route meski class NativeWind tidak diterapkan', async () => {
    const view = await render(
      <Screen>
        <Text>Isi</Text>
      </Screen>,
    );

    const root = view.toJSON();
    expect(root).not.toBeNull();
    expect(Array.isArray(root)).toBe(false);
    if (root !== null && !Array.isArray(root)) {
      expect(root.props.style).toEqual(expect.objectContaining({ flex: 1 }));
    }
  });
});
