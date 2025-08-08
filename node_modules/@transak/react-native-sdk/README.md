# Transak React Native SDK

A React Native SDK for decentralised applications to onboard their global user base with fiat currency.

## Installation

```sh
npm i @transak/react-native-sdk
```

Install these required peer dependencies to facilitate auto-linking.

```sh
npm i react-native-webview
npm i react-native-inappbrowser-reborn
npm i @react-native-community/netinfo
```

## Example usage

```tsx
import {
  TransakWebView, Environments, Events, TransakConfig, EventTypes, Order,
} from '@transak/react-native-sdk';

function TransakWebViewIntegration() {
  const transakConfig: TransakConfig = {
    apiKey: '<your-api-key>', // Required
    environment: Environments.STAGING/Environments.PRODUCTION, // Required
    partnerOrderId: '<unique-order-id-generated-by-your-system>', // Required to receive order events
    // .....
    // For the full list of query params refer Props section below
  };
  const onTransakEventHandler = (event: EventTypes, data: Order) => {
    switch(event) {
      case Events.ORDER_CREATED:
        console.log(event, data);
        break;

      case Events.ORDER_PROCESSING:
        console.log(event, data);
        break;

      case Events.ORDER_COMPLETED:
        console.log(event, data);
        break;

      default:
        console.log(event, data);
    }
  };

  return (
    <TransakWebView
      transakConfig={transakConfig}
      onTransakEvent={onTransakEventHandler}
      // .....
      // For the full list of react-native-webview props refer Props section below
    />
  );
}
```

### Props

| Prop           | Description                                                                                           |
|:---------------|:------------------------------------------------------------------------------------------------------|
| transakConfig  | Refer [here](https://docs.transak.com/docs/sdk) for the full list of customisation options            |
| onTransakEvent | Callback function to listen to order related [events](https://docs.transak.com/docs/websocket-events) |

<br />This component accepts most of the [react-native-webview props](https://github.com/react-native-webview/react-native-webview/blob/HEAD/docs/Reference.md), except the following: sharedCookiesEnabled, injectedJavaScript, injectedJavaScriptBeforeContentLoaded

> [!CAUTION]
> The partnerOrderId must be passed in the transakConfig to receive order events.

## License

ISC Licensed. Copyright (c) 2024 Transak Inc.
