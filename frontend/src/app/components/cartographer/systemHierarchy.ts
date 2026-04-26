// Hierarchical data model for the full-stack codebase visualization.
//
// Five nesting levels (outermost → innermost):
//   1. Tier            (Frontend / Backend / Database)
//   2. Layer           (Controller / Service / Repository / Entity)
//   3. Bounded context (Ordering / Catalog / Payments)
//   4. Package         (e.g. payments.gateway)
//   5. Class           (attributes, methods, stereotype)
//
// Every node — at every level — carries an explicit outgoing `dependencies`
// list keyed by id, so consumers can render directed graphs at any tier.
// The seeded dataset (`SYSTEM_HIERARCHY`) covers ~30 classes across three
// bounded contexts so views built on top of it have realistic data.

export type TierName = 'Frontend' | 'Backend' | 'Database';
export type LayerName = 'Controller' | 'Service' | 'Repository' | 'Entity';
export type ContextName = 'Ordering' | 'Catalog' | 'Payments';
export type Stereotype =
  | 'view'
  | 'controller'
  | 'service'
  | 'repository'
  | 'gateway'
  | 'entity'
  | 'value-object'
  | 'aggregate-root';

export interface Attribute {
  name: string;
  type: string;
}

export interface Method {
  name: string;
  signature: string;
  returns: string;
}

export interface ClassNode {
  id: string;
  kind: 'class';
  name: string;
  stereotype: Stereotype;
  attributes: Attribute[];
  methods: Method[];
  dependencies: string[];
}

export interface PackageNode {
  id: string;
  kind: 'package';
  name: string;
  classes: ClassNode[];
  dependencies: string[];
}

export interface ContextNode {
  id: string;
  kind: 'context';
  name: ContextName;
  packages: PackageNode[];
  dependencies: string[];
}

export interface LayerNode {
  id: string;
  kind: 'layer';
  name: LayerName;
  contexts: ContextNode[];
  dependencies: string[];
}

export interface TierNode {
  id: string;
  kind: 'tier';
  name: TierName;
  layers: LayerNode[];
  dependencies: string[];
}

export type AnyNode = TierNode | LayerNode | ContextNode | PackageNode | ClassNode;

// ---------------------------------------------------------------------------
// Seeded dataset — three bounded contexts (Ordering, Catalog, Payments) with
// 31 classes spread across the four layers and three tiers.
// ---------------------------------------------------------------------------

export const SYSTEM_HIERARCHY: TierNode[] = [
  {
    id: 'tier.frontend',
    kind: 'tier',
    name: 'Frontend',
    dependencies: ['tier.backend'],
    layers: [
      {
        id: 'tier.frontend.layer.controller',
        kind: 'layer',
        name: 'Controller',
        dependencies: ['tier.backend.layer.controller'],
        contexts: [
          {
            id: 'fe.controller.ordering',
            kind: 'context',
            name: 'Ordering',
            dependencies: ['be.controller.ordering'],
            packages: [
              {
                id: 'fe.controller.ordering.ui',
                kind: 'package',
                name: 'ordering.ui',
                dependencies: ['be.controller.ordering.api'],
                classes: [
                  {
                    id: 'cls.fe.OrderListPage',
                    kind: 'class',
                    name: 'OrderListPage',
                    stereotype: 'view',
                    attributes: [
                      { name: 'orders', type: 'OrderSummary[]' },
                      { name: 'isLoading', type: 'boolean' },
                    ],
                    methods: [
                      { name: 'fetchOrders', signature: 'fetchOrders()', returns: 'Promise<void>' },
                      { name: 'render', signature: 'render()', returns: 'JSX.Element' },
                    ],
                    dependencies: ['cls.be.OrderController'],
                  },
                  {
                    id: 'cls.fe.OrderDetailPage',
                    kind: 'class',
                    name: 'OrderDetailPage',
                    stereotype: 'view',
                    attributes: [
                      { name: 'order', type: 'OrderDetail' },
                    ],
                    methods: [
                      { name: 'cancelOrder', signature: 'cancelOrder()', returns: 'Promise<void>' },
                      { name: 'render', signature: 'render()', returns: 'JSX.Element' },
                    ],
                    dependencies: ['cls.be.OrderController'],
                  },
                  {
                    id: 'cls.fe.CartView',
                    kind: 'class',
                    name: 'CartView',
                    stereotype: 'view',
                    attributes: [
                      { name: 'items', type: 'CartItem[]' },
                    ],
                    methods: [
                      { name: 'checkout', signature: 'checkout()', returns: 'Promise<void>' },
                    ],
                    dependencies: ['cls.be.OrderController', 'cls.fe.CheckoutForm'],
                  },
                ],
              },
            ],
          },
          {
            id: 'fe.controller.catalog',
            kind: 'context',
            name: 'Catalog',
            dependencies: ['be.controller.catalog'],
            packages: [
              {
                id: 'fe.controller.catalog.ui',
                kind: 'package',
                name: 'catalog.ui',
                dependencies: ['be.controller.catalog.api'],
                classes: [
                  {
                    id: 'cls.fe.ProductGrid',
                    kind: 'class',
                    name: 'ProductGrid',
                    stereotype: 'view',
                    attributes: [
                      { name: 'products', type: 'Product[]' },
                      { name: 'filters', type: 'CatalogFilter' },
                    ],
                    methods: [
                      { name: 'loadPage', signature: 'loadPage(n: number)', returns: 'Promise<void>' },
                    ],
                    dependencies: ['cls.be.ProductController'],
                  },
                  {
                    id: 'cls.fe.ProductDetail',
                    kind: 'class',
                    name: 'ProductDetail',
                    stereotype: 'view',
                    attributes: [
                      { name: 'product', type: 'Product' },
                    ],
                    methods: [
                      { name: 'addToCart', signature: 'addToCart()', returns: 'void' },
                    ],
                    dependencies: ['cls.be.ProductController', 'cls.fe.CartView'],
                  },
                  {
                    id: 'cls.fe.SearchBar',
                    kind: 'class',
                    name: 'SearchBar',
                    stereotype: 'view',
                    attributes: [
                      { name: 'query', type: 'string' },
                    ],
                    methods: [
                      { name: 'submit', signature: 'submit()', returns: 'void' },
                    ],
                    dependencies: ['cls.be.ProductController'],
                  },
                ],
              },
            ],
          },
          {
            id: 'fe.controller.payments',
            kind: 'context',
            name: 'Payments',
            dependencies: ['be.controller.payments'],
            packages: [
              {
                id: 'fe.controller.payments.ui',
                kind: 'package',
                name: 'payments.ui',
                dependencies: ['be.controller.payments.api'],
                classes: [
                  {
                    id: 'cls.fe.CheckoutForm',
                    kind: 'class',
                    name: 'CheckoutForm',
                    stereotype: 'view',
                    attributes: [
                      { name: 'amount', type: 'Money' },
                      { name: 'method', type: 'PaymentMethod' },
                    ],
                    methods: [
                      { name: 'submit', signature: 'submit()', returns: 'Promise<PaymentResult>' },
                    ],
                    dependencies: ['cls.be.CheckoutController'],
                  },
                  {
                    id: 'cls.fe.PaymentReceipt',
                    kind: 'class',
                    name: 'PaymentReceipt',
                    stereotype: 'view',
                    attributes: [
                      { name: 'payment', type: 'PaymentSummary' },
                    ],
                    methods: [
                      { name: 'print', signature: 'print()', returns: 'void' },
                    ],
                    dependencies: ['cls.be.CheckoutController'],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  {
    id: 'tier.backend',
    kind: 'tier',
    name: 'Backend',
    dependencies: ['tier.database'],
    layers: [
      {
        id: 'tier.backend.layer.controller',
        kind: 'layer',
        name: 'Controller',
        dependencies: ['tier.backend.layer.service'],
        contexts: [
          {
            id: 'be.controller.ordering',
            kind: 'context',
            name: 'Ordering',
            dependencies: ['be.service.ordering'],
            packages: [
              {
                id: 'be.controller.ordering.api',
                kind: 'package',
                name: 'ordering.api',
                dependencies: ['be.service.ordering.core'],
                classes: [
                  {
                    id: 'cls.be.OrderController',
                    kind: 'class',
                    name: 'OrderController',
                    stereotype: 'controller',
                    attributes: [
                      { name: 'orderService', type: 'OrderService' },
                    ],
                    methods: [
                      { name: 'list', signature: 'list(userId: ID)', returns: 'OrderSummary[]' },
                      { name: 'detail', signature: 'detail(id: ID)', returns: 'OrderDetail' },
                      { name: 'cancel', signature: 'cancel(id: ID)', returns: 'void' },
                    ],
                    dependencies: ['cls.be.OrderService', 'cls.be.CartService'],
                  },
                ],
              },
            ],
          },
          {
            id: 'be.controller.catalog',
            kind: 'context',
            name: 'Catalog',
            dependencies: ['be.service.catalog'],
            packages: [
              {
                id: 'be.controller.catalog.api',
                kind: 'package',
                name: 'catalog.api',
                dependencies: ['be.service.catalog.core'],
                classes: [
                  {
                    id: 'cls.be.ProductController',
                    kind: 'class',
                    name: 'ProductController',
                    stereotype: 'controller',
                    attributes: [
                      { name: 'productService', type: 'ProductService' },
                    ],
                    methods: [
                      { name: 'search', signature: 'search(q: string)', returns: 'Product[]' },
                      { name: 'detail', signature: 'detail(id: ID)', returns: 'Product' },
                    ],
                    dependencies: ['cls.be.ProductService'],
                  },
                  {
                    id: 'cls.be.CategoryController',
                    kind: 'class',
                    name: 'CategoryController',
                    stereotype: 'controller',
                    attributes: [],
                    methods: [
                      { name: 'list', signature: 'list()', returns: 'Category[]' },
                    ],
                    dependencies: ['cls.be.ProductService'],
                  },
                ],
              },
            ],
          },
          {
            id: 'be.controller.payments',
            kind: 'context',
            name: 'Payments',
            dependencies: ['be.service.payments'],
            packages: [
              {
                id: 'be.controller.payments.api',
                kind: 'package',
                name: 'payments.api',
                dependencies: ['be.service.payments.core'],
                classes: [
                  {
                    id: 'cls.be.CheckoutController',
                    kind: 'class',
                    name: 'CheckoutController',
                    stereotype: 'controller',
                    attributes: [
                      { name: 'paymentService', type: 'PaymentService' },
                    ],
                    methods: [
                      { name: 'pay', signature: 'pay(req: PaymentRequest)', returns: 'PaymentResult' },
                      { name: 'refund', signature: 'refund(id: ID)', returns: 'RefundResult' },
                    ],
                    dependencies: ['cls.be.PaymentService', 'cls.be.RefundService'],
                  },
                ],
              },
            ],
          },
        ],
      },

      {
        id: 'tier.backend.layer.service',
        kind: 'layer',
        name: 'Service',
        dependencies: ['tier.backend.layer.repository'],
        contexts: [
          {
            id: 'be.service.ordering',
            kind: 'context',
            name: 'Ordering',
            dependencies: ['be.repository.ordering', 'be.service.catalog', 'be.service.payments'],
            packages: [
              {
                id: 'be.service.ordering.core',
                kind: 'package',
                name: 'ordering.service',
                dependencies: [
                  'be.repository.ordering.core',
                  'be.service.catalog.core',
                  'be.service.payments.core',
                ],
                classes: [
                  {
                    id: 'cls.be.OrderService',
                    kind: 'class',
                    name: 'OrderService',
                    stereotype: 'service',
                    attributes: [
                      { name: 'orderRepository', type: 'OrderRepository' },
                      { name: 'inventory', type: 'InventoryService' },
                      { name: 'payments', type: 'PaymentService' },
                    ],
                    methods: [
                      { name: 'placeOrder', signature: 'placeOrder(cart: Cart)', returns: 'Order' },
                      { name: 'cancel', signature: 'cancel(id: ID)', returns: 'void' },
                    ],
                    dependencies: [
                      'cls.be.OrderRepository',
                      'cls.be.InventoryService',
                      'cls.be.PaymentService',
                    ],
                  },
                  {
                    id: 'cls.be.CartService',
                    kind: 'class',
                    name: 'CartService',
                    stereotype: 'service',
                    attributes: [
                      { name: 'cartRepository', type: 'CartRepository' },
                    ],
                    methods: [
                      { name: 'addItem', signature: 'addItem(cartId: ID, sku: string)', returns: 'void' },
                      { name: 'remove', signature: 'remove(cartId: ID, sku: string)', returns: 'void' },
                    ],
                    dependencies: ['cls.be.CartRepository', 'cls.be.ProductService'],
                  },
                ],
              },
            ],
          },
          {
            id: 'be.service.catalog',
            kind: 'context',
            name: 'Catalog',
            dependencies: ['be.repository.catalog'],
            packages: [
              {
                id: 'be.service.catalog.core',
                kind: 'package',
                name: 'catalog.service',
                dependencies: ['be.repository.catalog.core'],
                classes: [
                  {
                    id: 'cls.be.ProductService',
                    kind: 'class',
                    name: 'ProductService',
                    stereotype: 'service',
                    attributes: [
                      { name: 'productRepository', type: 'ProductRepository' },
                    ],
                    methods: [
                      { name: 'search', signature: 'search(q: string)', returns: 'Product[]' },
                      { name: 'find', signature: 'find(id: ID)', returns: 'Product' },
                    ],
                    dependencies: ['cls.be.ProductRepository'],
                  },
                  {
                    id: 'cls.be.InventoryService',
                    kind: 'class',
                    name: 'InventoryService',
                    stereotype: 'service',
                    attributes: [
                      { name: 'productRepository', type: 'ProductRepository' },
                    ],
                    methods: [
                      { name: 'reserve', signature: 'reserve(sku: string, qty: int)', returns: 'Reservation' },
                      { name: 'release', signature: 'release(reservation: Reservation)', returns: 'void' },
                    ],
                    dependencies: ['cls.be.ProductRepository'],
                  },
                ],
              },
            ],
          },
          {
            id: 'be.service.payments',
            kind: 'context',
            name: 'Payments',
            dependencies: ['be.repository.payments'],
            packages: [
              {
                id: 'be.service.payments.core',
                kind: 'package',
                name: 'payments.service',
                dependencies: [
                  'be.repository.payments.core',
                  'be.service.payments.gateway',
                ],
                classes: [
                  {
                    id: 'cls.be.PaymentService',
                    kind: 'class',
                    name: 'PaymentService',
                    stereotype: 'service',
                    attributes: [
                      { name: 'paymentRepository', type: 'PaymentRepository' },
                      { name: 'gateway', type: 'PaymentGateway' },
                    ],
                    methods: [
                      { name: 'charge', signature: 'charge(req: PaymentRequest)', returns: 'PaymentResult' },
                    ],
                    dependencies: ['cls.be.PaymentRepository', 'cls.be.StripeGateway', 'cls.be.PayPalGateway'],
                  },
                  {
                    id: 'cls.be.RefundService',
                    kind: 'class',
                    name: 'RefundService',
                    stereotype: 'service',
                    attributes: [
                      { name: 'paymentRepository', type: 'PaymentRepository' },
                    ],
                    methods: [
                      { name: 'refund', signature: 'refund(paymentId: ID)', returns: 'RefundResult' },
                    ],
                    dependencies: ['cls.be.PaymentRepository', 'cls.be.StripeGateway'],
                  },
                ],
              },
              {
                id: 'be.service.payments.gateway',
                kind: 'package',
                name: 'payments.gateway',
                dependencies: [],
                classes: [
                  {
                    id: 'cls.be.StripeGateway',
                    kind: 'class',
                    name: 'StripeGateway',
                    stereotype: 'gateway',
                    attributes: [
                      { name: 'apiKey', type: 'string' },
                    ],
                    methods: [
                      { name: 'authorize', signature: 'authorize(req: PaymentRequest)', returns: 'PaymentResult' },
                      { name: 'capture', signature: 'capture(authId: string)', returns: 'void' },
                    ],
                    dependencies: [],
                  },
                  {
                    id: 'cls.be.PayPalGateway',
                    kind: 'class',
                    name: 'PayPalGateway',
                    stereotype: 'gateway',
                    attributes: [
                      { name: 'clientId', type: 'string' },
                    ],
                    methods: [
                      { name: 'authorize', signature: 'authorize(req: PaymentRequest)', returns: 'PaymentResult' },
                    ],
                    dependencies: [],
                  },
                ],
              },
            ],
          },
        ],
      },

      {
        id: 'tier.backend.layer.repository',
        kind: 'layer',
        name: 'Repository',
        dependencies: ['tier.database'],
        contexts: [
          {
            id: 'be.repository.ordering',
            kind: 'context',
            name: 'Ordering',
            dependencies: ['db.entity.ordering'],
            packages: [
              {
                id: 'be.repository.ordering.core',
                kind: 'package',
                name: 'ordering.repository',
                dependencies: ['db.entity.ordering.core'],
                classes: [
                  {
                    id: 'cls.be.OrderRepository',
                    kind: 'class',
                    name: 'OrderRepository',
                    stereotype: 'repository',
                    attributes: [],
                    methods: [
                      { name: 'save', signature: 'save(order: Order)', returns: 'Order' },
                      { name: 'findById', signature: 'findById(id: ID)', returns: 'Order' },
                    ],
                    dependencies: ['cls.db.Order', 'cls.db.OrderItem'],
                  },
                  {
                    id: 'cls.be.CartRepository',
                    kind: 'class',
                    name: 'CartRepository',
                    stereotype: 'repository',
                    attributes: [],
                    methods: [
                      { name: 'save', signature: 'save(cart: Cart)', returns: 'Cart' },
                      { name: 'findByUser', signature: 'findByUser(uid: ID)', returns: 'Cart' },
                    ],
                    dependencies: ['cls.db.Cart'],
                  },
                ],
              },
            ],
          },
          {
            id: 'be.repository.catalog',
            kind: 'context',
            name: 'Catalog',
            dependencies: ['db.entity.catalog'],
            packages: [
              {
                id: 'be.repository.catalog.core',
                kind: 'package',
                name: 'catalog.repository',
                dependencies: ['db.entity.catalog.core'],
                classes: [
                  {
                    id: 'cls.be.ProductRepository',
                    kind: 'class',
                    name: 'ProductRepository',
                    stereotype: 'repository',
                    attributes: [],
                    methods: [
                      { name: 'search', signature: 'search(q: string)', returns: 'Product[]' },
                      { name: 'findById', signature: 'findById(id: ID)', returns: 'Product' },
                    ],
                    dependencies: ['cls.db.Product', 'cls.db.Category'],
                  },
                ],
              },
            ],
          },
          {
            id: 'be.repository.payments',
            kind: 'context',
            name: 'Payments',
            dependencies: ['db.entity.payments'],
            packages: [
              {
                id: 'be.repository.payments.core',
                kind: 'package',
                name: 'payments.repository',
                dependencies: ['db.entity.payments.core'],
                classes: [
                  {
                    id: 'cls.be.PaymentRepository',
                    kind: 'class',
                    name: 'PaymentRepository',
                    stereotype: 'repository',
                    attributes: [],
                    methods: [
                      { name: 'save', signature: 'save(payment: Payment)', returns: 'Payment' },
                      { name: 'findByOrder', signature: 'findByOrder(orderId: ID)', returns: 'Payment[]' },
                    ],
                    dependencies: ['cls.db.Payment', 'cls.db.Refund'],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  {
    id: 'tier.database',
    kind: 'tier',
    name: 'Database',
    dependencies: [],
    layers: [
      {
        id: 'tier.database.layer.entity',
        kind: 'layer',
        name: 'Entity',
        dependencies: [],
        contexts: [
          {
            id: 'db.entity.ordering',
            kind: 'context',
            name: 'Ordering',
            dependencies: ['db.entity.catalog', 'db.entity.payments'],
            packages: [
              {
                id: 'db.entity.ordering.core',
                kind: 'package',
                name: 'ordering.entity',
                dependencies: ['db.entity.catalog.core', 'db.entity.payments.core'],
                classes: [
                  {
                    id: 'cls.db.Order',
                    kind: 'class',
                    name: 'Order',
                    stereotype: 'aggregate-root',
                    attributes: [
                      { name: 'id', type: 'ID' },
                      { name: 'userId', type: 'ID' },
                      { name: 'placedAt', type: 'Timestamp' },
                      { name: 'status', type: 'OrderStatus' },
                      { name: 'total', type: 'Money' },
                    ],
                    methods: [
                      { name: 'totalAmount', signature: 'totalAmount()', returns: 'Money' },
                      { name: 'cancel', signature: 'cancel()', returns: 'void' },
                    ],
                    dependencies: ['cls.db.OrderItem', 'cls.db.Payment'],
                  },
                  {
                    id: 'cls.db.OrderItem',
                    kind: 'class',
                    name: 'OrderItem',
                    stereotype: 'entity',
                    attributes: [
                      { name: 'id', type: 'ID' },
                      { name: 'orderId', type: 'ID' },
                      { name: 'productId', type: 'ID' },
                      { name: 'quantity', type: 'int' },
                      { name: 'unitPrice', type: 'Money' },
                    ],
                    methods: [
                      { name: 'lineTotal', signature: 'lineTotal()', returns: 'Money' },
                    ],
                    dependencies: ['cls.db.Product'],
                  },
                  {
                    id: 'cls.db.Cart',
                    kind: 'class',
                    name: 'Cart',
                    stereotype: 'aggregate-root',
                    attributes: [
                      { name: 'id', type: 'ID' },
                      { name: 'userId', type: 'ID' },
                      { name: 'items', type: 'CartItem[]' },
                    ],
                    methods: [
                      { name: 'add', signature: 'add(productId: ID, qty: int)', returns: 'void' },
                    ],
                    dependencies: ['cls.db.Product'],
                  },
                ],
              },
            ],
          },
          {
            id: 'db.entity.catalog',
            kind: 'context',
            name: 'Catalog',
            dependencies: [],
            packages: [
              {
                id: 'db.entity.catalog.core',
                kind: 'package',
                name: 'catalog.entity',
                dependencies: [],
                classes: [
                  {
                    id: 'cls.db.Product',
                    kind: 'class',
                    name: 'Product',
                    stereotype: 'aggregate-root',
                    attributes: [
                      { name: 'id', type: 'ID' },
                      { name: 'sku', type: 'string' },
                      { name: 'name', type: 'string' },
                      { name: 'price', type: 'Money' },
                      { name: 'categoryId', type: 'ID' },
                    ],
                    methods: [
                      { name: 'priceWithTax', signature: 'priceWithTax(rate: float)', returns: 'Money' },
                    ],
                    dependencies: ['cls.db.Category'],
                  },
                  {
                    id: 'cls.db.Category',
                    kind: 'class',
                    name: 'Category',
                    stereotype: 'entity',
                    attributes: [
                      { name: 'id', type: 'ID' },
                      { name: 'name', type: 'string' },
                      { name: 'parentId', type: 'ID?' },
                    ],
                    methods: [],
                    dependencies: [],
                  },
                ],
              },
            ],
          },
          {
            id: 'db.entity.payments',
            kind: 'context',
            name: 'Payments',
            dependencies: ['db.entity.ordering'],
            packages: [
              {
                id: 'db.entity.payments.core',
                kind: 'package',
                name: 'payments.entity',
                dependencies: ['db.entity.ordering.core'],
                classes: [
                  {
                    id: 'cls.db.Payment',
                    kind: 'class',
                    name: 'Payment',
                    stereotype: 'aggregate-root',
                    attributes: [
                      { name: 'id', type: 'ID' },
                      { name: 'orderId', type: 'ID' },
                      { name: 'amount', type: 'Money' },
                      { name: 'method', type: 'PaymentMethod' },
                      { name: 'status', type: 'PaymentStatus' },
                    ],
                    methods: [
                      { name: 'isCaptured', signature: 'isCaptured()', returns: 'boolean' },
                    ],
                    dependencies: ['cls.db.Order'],
                  },
                  {
                    id: 'cls.db.Refund',
                    kind: 'class',
                    name: 'Refund',
                    stereotype: 'entity',
                    attributes: [
                      { name: 'id', type: 'ID' },
                      { name: 'paymentId', type: 'ID' },
                      { name: 'amount', type: 'Money' },
                      { name: 'reason', type: 'string' },
                    ],
                    methods: [],
                    dependencies: ['cls.db.Payment'],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helper: flatten the hierarchy into a flat lookup map keyed by node id.
// Useful for resolving dependency arrows when rendering any view level.
// ---------------------------------------------------------------------------
export function indexHierarchy(roots: TierNode[] = SYSTEM_HIERARCHY): Map<string, AnyNode> {
  const out = new Map<string, AnyNode>();
  const visit = (node: AnyNode) => {
    out.set(node.id, node);
    if (node.kind === 'tier') node.layers.forEach(visit);
    else if (node.kind === 'layer') node.contexts.forEach(visit);
    else if (node.kind === 'context') node.packages.forEach(visit);
    else if (node.kind === 'package') node.classes.forEach(visit);
  };
  roots.forEach(visit);
  return out;
}
