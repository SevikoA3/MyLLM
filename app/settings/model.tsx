import { Redirect, useLocalSearchParams } from 'expo-router';

export default function ModelRedirect() {
  const params = useLocalSearchParams();
  return <Redirect href={{ pathname: '/settings/models/model', params }} />;
}
