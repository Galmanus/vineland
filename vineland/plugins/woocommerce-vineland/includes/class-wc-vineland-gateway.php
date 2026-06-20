<?php
/**
 * Vineland payment gateway class.
 * Hooks into WooCommerce checkout: when buyer picks Vineland, the plugin
 * calls POST /api/v1/orders on the Vineland backend, then redirects the
 * buyer to the hosted checkout URL. Confirmation comes back via webhook.
 *
 * @package WooCommerce_Vineland
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WC_Vineland_Gateway extends WC_Payment_Gateway {

    public function __construct() {
        $this->id                 = 'vineland';
        $this->method_title       = __( 'Vineland (USDC / PYUSD on Stellar)', 'woocommerce-vineland' );
        $this->method_description = __( 'Accept stablecoin payments via Vineland. Buyer pays in BRL via Pix; merchant receives USDC or PYUSD on Stellar in 6 seconds. No chargebacks. Non-custodial.', 'woocommerce-vineland' );
        $this->has_fields         = false;

        $this->init_form_fields();
        $this->init_settings();

        $this->title         = $this->get_option( 'title' );
        $this->description   = $this->get_option( 'description' );
        $this->enabled       = $this->get_option( 'enabled' );
        $this->api_key       = $this->get_option( 'api_key' );
        $this->api_base      = $this->get_option( 'api_base', 'https://api.vineland.cc' );
        $this->webhook_secret = $this->get_option( 'webhook_secret' );
        $this->asset_code    = $this->get_option( 'asset_code', 'USDC' );
        $this->environment   = $this->get_option( 'environment', 'testnet' );

        $this->icon = apply_filters( 'wc_vineland_icon', plugins_url( 'assets/vineland-mark.svg', WC_VINELAND_PLUGIN_FILE ) );

        add_action( 'woocommerce_update_options_payment_gateways_' . $this->id, [ $this, 'process_admin_options' ] );
    }

    public function init_form_fields() {
        $this->form_fields = [
            'enabled' => [
                'title'   => __( 'Enable / Disable', 'woocommerce-vineland' ),
                'type'    => 'checkbox',
                'label'   => __( 'Enable Vineland payments', 'woocommerce-vineland' ),
                'default' => 'no',
            ],
            'environment' => [
                'title'   => __( 'Environment', 'woocommerce-vineland' ),
                'type'    => 'select',
                'options' => [
                    'testnet' => __( 'Testnet (free, no real money)', 'woocommerce-vineland' ),
                    'mainnet' => __( 'Mainnet (real USDC settles to merchant)', 'woocommerce-vineland' ),
                ],
                'default' => 'testnet',
                'description' => __( 'Use testnet to test the integration before going live.', 'woocommerce-vineland' ),
            ],
            'title' => [
                'title'       => __( 'Title at checkout', 'woocommerce-vineland' ),
                'type'        => 'text',
                'default'     => __( 'Pay with Vineland (USDC or PYUSD)', 'woocommerce-vineland' ),
                'description' => __( 'What buyers see at checkout.', 'woocommerce-vineland' ),
            ],
            'description' => [
                'title'   => __( 'Description at checkout', 'woocommerce-vineland' ),
                'type'    => 'textarea',
                'default' => __( 'Pay in BRL via Pix or in stablecoin (USDC / PYUSD) on Stellar. Settles in roughly 6 seconds. Non-custodial: your funds go directly to the merchant wallet.', 'woocommerce-vineland' ),
            ],
            'api_base' => [
                'title'       => __( 'Vineland API base URL', 'woocommerce-vineland' ),
                'type'        => 'text',
                'default'     => 'https://api.vineland.cc',
                'description' => __( 'Override only if you self-host Vineland or use a custom region endpoint.', 'woocommerce-vineland' ),
            ],
            'api_key' => [
                'title'       => __( 'API key', 'woocommerce-vineland' ),
                'type'        => 'password',
                'description' => __( 'Get this from your Vineland merchant dashboard, Settings tab. Format: sk_live_...', 'woocommerce-vineland' ),
            ],
            'asset_code' => [
                'title'   => __( 'Default settlement asset', 'woocommerce-vineland' ),
                'type'    => 'select',
                'options' => [
                    'USDC'  => 'USDC (Circle)',
                    'PYUSD' => 'PYUSD (PayPal)',
                ],
                'default' => 'USDC',
            ],
            'webhook_secret' => [
                'title'       => __( 'Webhook secret', 'woocommerce-vineland' ),
                'type'        => 'password',
                'description' => __( 'Required. Minimum 32 characters. Must match the secret set in your Vineland merchant settings. Plugin verifies HMAC-SHA256 with timestamp and replay protection on each delivery. Empty secret blocks all webhook deliveries (503).', 'woocommerce-vineland' ),
                'custom_attributes' => [ 'required' => 'required', 'minlength' => 32 ],
            ],
        ];
    }

    /**
     * Called when the customer clicks Place Order with Vineland selected.
     * Returns redirect to the Vineland-hosted checkout for the new order.
     */
    public function process_payment( $order_id ) {
        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            wc_add_notice( __( 'Could not load order.', 'woocommerce-vineland' ), 'error' );
            return [ 'result' => 'fail' ];
        }

        if ( empty( $this->api_key ) ) {
            wc_add_notice( __( 'Vineland API key not configured.', 'woocommerce-vineland' ), 'error' );
            return [ 'result' => 'fail' ];
        }

        // Audit-006 W1: api_key prefix must match the configured environment.
        // A merchant who toggles to mainnet while still holding an sk_test_
        // key would otherwise post real orders to production with a
        // credential that can never authenticate — silent fail in admin UI
        // and visible-only-to-attacker probing on the API side.
        $env = $this->environment === 'mainnet' ? 'live' : 'test';
        $expected_prefix = 'sk_' . $env . '_';
        if ( strpos( $this->api_key, $expected_prefix ) !== 0 ) {
            wc_add_notice( __( 'Vineland configuration error: API key environment does not match the selected environment. Use a key matching the selected testnet/mainnet mode.', 'woocommerce-vineland' ), 'error' );
            return [ 'result' => 'fail' ];
        }

        // Audit-006 W2: api_base allowlist. By default only *.vineland.cc is
        // accepted. Self-hosters set WC_VINELAND_ALLOW_CUSTOM_API in wp-config
        // to opt out of this guard explicitly — operator-visible, not silent.
        if ( ! $this->is_api_base_allowed( $this->api_base ) ) {
            wc_add_notice( __( 'Vineland configuration error: API base host is not allowed.', 'woocommerce-vineland' ), 'error' );
            return [ 'result' => 'fail' ];
        }

        // BRL amount with two decimals (Vineland schema validates ^\d{1,9}\.\d{2}$).
        $brl = number_format( (float) $order->get_total(), 2, '.', '' );

        $body = wp_json_encode( [
            'brl_amount'         => $brl,
            'external_ref'       => 'wc_' . $order->get_id(),
            'expires_in_minutes' => 30,
        ] );

        $response = wp_remote_post( trailingslashit( $this->api_base ) . 'api/v1/orders', [
            'headers' => [
                'Authorization' => 'Bearer ' . $this->api_key,
                'Content-Type'  => 'application/json',
            ],
            'body'    => $body,
            'timeout' => 15,
        ] );

        if ( is_wp_error( $response ) ) {
            // Audit-006 W3: escape values pulled from external sources before
            // interpolating into order notes (WC renders notes as HTML in admin).
            $order->add_order_note( 'Vineland request error: ' . esc_html( $response->get_error_message() ) );
            wc_add_notice( __( 'Payment service unreachable. Try again.', 'woocommerce-vineland' ), 'error' );
            return [ 'result' => 'fail' ];
        }

        $code = wp_remote_retrieve_response_code( $response );
        $data = json_decode( wp_remote_retrieve_body( $response ), true );

        if ( $code !== 201 || empty( $data['order']['id'] ) || empty( $data['checkout_url'] ) ) {
            $detail = isset( $data['detail'] ) ? $data['detail'] : ( isset( $data['error'] ) ? $data['error'] : 'unknown' );
            $order->add_order_note( 'Vineland order create failed (' . intval( $code ) . '): ' . esc_html( (string) $detail ) );
            wc_add_notice( __( 'Payment failed to initiate. Please try again.', 'woocommerce-vineland' ), 'error' );
            return [ 'result' => 'fail' ];
        }

        // Audit-006 W2: validate the redirect host actually belongs to the
        // configured api_base before sending the customer there. A compromised
        // api_base that returns checkout_url=https://phishing/... would
        // otherwise silently exfiltrate buyers.
        $checkout_url = (string) $data['checkout_url'];
        if ( ! $this->is_checkout_url_safe( $checkout_url, $this->api_base ) ) {
            $order->add_order_note( 'Vineland rejected redirect to untrusted host: ' . esc_html( $checkout_url ) );
            wc_add_notice( __( 'Payment failed: untrusted checkout host.', 'woocommerce-vineland' ), 'error' );
            return [ 'result' => 'fail' ];
        }

        // Store the Vineland order id so the webhook can match back.
        $order->update_meta_data( '_vineland_order_id', sanitize_text_field( $data['order']['id'] ) );
        $order->update_meta_data( '_vineland_memo',     sanitize_text_field( $data['order']['memo'] ) );
        $order->update_meta_data( '_vineland_usdc_amount', sanitize_text_field( $data['order']['usdc_amount'] ) );
        $order->save();

        $order->update_status( 'pending', __( 'Vineland order created. Awaiting on-chain payment.', 'woocommerce-vineland' ) );

        return [
            'result'   => 'success',
            'redirect' => $checkout_url,
        ];
    }

    /**
     * Audit-006 W6: refunds are not supported on-chain in v0.1 (non-custodial
     * settlement — the merchant holds USDC directly, refunds happen wallet-to-
     * wallet manually). Return a clear WP_Error so WC admins see a real
     * message instead of a silently failing "Refund" button.
     */
    public function process_refund( $order_id, $amount = null, $reason = '' ) {
        return new WP_Error(
            'vineland_no_onchain_refund',
            __( 'Vineland v0.1 does not support automated refunds. Send USDC back to the buyer wallet manually and add an order note.', 'woocommerce-vineland' )
        );
    }

    /**
     * Audit-006 W1+W2 helpers.
     */
    private function is_api_base_allowed( $url ) {
        $parts = wp_parse_url( $url );
        if ( ! is_array( $parts ) || empty( $parts['host'] ) ) return false;
        if ( ( $parts['scheme'] ?? '' ) !== 'https' ) return false;
        $host = strtolower( $parts['host'] );
        // Default allowlist: *.vineland.cc and vineland.cc itself.
        $allowed = $host === 'vineland.cc' || (bool) preg_match( '/\.vineland\.cc$/', $host );
        if ( $allowed ) return true;
        return defined( 'WC_VINELAND_ALLOW_CUSTOM_API' ) && WC_VINELAND_ALLOW_CUSTOM_API;
    }

    private function is_checkout_url_safe( $checkout_url, $api_base ) {
        $cu = wp_parse_url( $checkout_url );
        $ab = wp_parse_url( $api_base );
        if ( ! is_array( $cu ) || ! is_array( $ab ) ) return false;
        if ( ( $cu['scheme'] ?? '' ) !== 'https' ) return false;
        if ( empty( $cu['host'] ) || empty( $ab['host'] ) ) return false;
        $cu_host = strtolower( $cu['host'] );
        $ab_host = strtolower( $ab['host'] );
        // Same registrable domain as api_base. Strict equality on the
        // hostname OR sibling under *.vineland.cc when api_base is on vineland.cc.
        if ( $cu_host === $ab_host ) return true;
        if ( preg_match( '/\.vineland\.cc$/', $ab_host ) && preg_match( '/\.vineland\.cc$/', $cu_host ) ) {
            return true;
        }
        return false;
    }

    /**
     * Audit-006 W8: BRL currency gate. Vineland's order create endpoint
     * accepts brl_amount as the wire currency; submitting a USD/EUR cart
     * total under that label would silently miscalculate the conversion.
     * Hide the gateway when cart currency is not BRL.
     *
     * Also audit-006 W6 baseline: hide on zero-total carts.
     */
    public function is_available() {
        if ( 'yes' !== $this->enabled )       return false;
        if ( empty( $this->api_key ) )        return false;
        if ( function_exists( 'get_woocommerce_currency' ) && get_woocommerce_currency() !== 'BRL' ) {
            return false;
        }
        if ( WC()->cart && WC()->cart->total <= 0 ) return false;
        return parent::is_available();
    }
}
