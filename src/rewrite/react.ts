import ts from 'typescript';
import { builders as b, namedTypes as n } from 'ast-types';
import K from 'ast-types/gen/kinds';
import { Converter, ErrorOr, mkError, mkSuccess } from '../convert';
import {
  mkNamespaceRewrite,
  mkTypeReferenceMacro,
  NamespaceRewrite,
  prepImportSubstitute,
} from './core';

const prefix = '$tsflower_subst$React$';

function convertReactComponent(
  converter: Converter,
  typeName: ts.EntityNameOrEntityNameExpression,
  typeArguments: ts.NodeArray<ts.TypeNode> | void,
): ErrorOr<{
  id: K.IdentifierKind | n.QualifiedTypeIdentifier;
  typeParameters: n.TypeParameterInstantiation | null;
}> {
  if ((typeArguments?.length ?? 0) > 2) {
    return mkError(
      `bad React.Component: ${
        typeArguments?.length ?? 0
      } arguments (expected 0-2)`,
    );
  }
  const [propsType, stateType] = typeArguments ?? [];

  const args = [
    propsType
      ? converter.convertType(propsType)
      : b.objectTypeAnnotation.from({ properties: [], inexact: true }),
    ...(stateType ? [converter.convertType(stateType)] : []),
  ];

  return mkSuccess({
    id: converter.convertEntityNameAsType(typeName),
    typeParameters: b.typeParameterInstantiation(args),
  });
}

function convertReactElement(
  converter: Converter,
  typeName: ts.EntityNameOrEntityNameExpression,
  typeArguments: ts.NodeArray<ts.TypeNode> | void,
) {
  // TODO: If ReactElement is imported individually, we also need to rewrite
  //   that import.

  if ((typeArguments?.length ?? 0) > 2) {
    return mkError(
      `bad React.Element: ${
        typeArguments?.length ?? 0
      } arguments (expected 0-2)`,
    );
  }
  const [propsType, typeType] = typeArguments ?? [];

  let args;
  if (!propsType) {
    args = [b.genericTypeAnnotation(b.identifier('React$ElementType'), null)];
  } else if (!typeType) {
    args = [
      b.genericTypeAnnotation(
        b.identifier('React$ComponentType'),
        b.typeParameterInstantiation([converter.convertType(propsType)]),
      ),
    ];
  } else {
    args = [converter.convertType(typeType)];
  }

  return mkSuccess({
    id: b.identifier('React$Element'), // TODO use import
    typeParameters: b.typeParameterInstantiation(args),
  });
}

/**
 * Prepare our static rewrite plans for the 'react' module.
 */
export function prepReactRewrites(): NamespaceRewrite {
  // All from `@types/react/index.d.ts`.

  return mkNamespaceRewrite(
    {
      Component: mkTypeReferenceMacro(convertReactComponent),
      ReactElement: mkTypeReferenceMacro(convertReactElement),

      // TODO: Have the mapper find these import substitutions directly from
      //   the declarations in subst/react.js.flow, rather than list them here
      ...Object.fromEntries(
        [
          'JSXElementConstructor',
          'RefObject',
          'RefCallback',
          'Ref',
          'LegacyRef',
          'ComponentState',
          'RefAttributes',
          'CElement',
          'ComponentElement',
          'ReactNode',
          'ProviderProps',
          'ConsumerProps',
          'NamedExoticComponent',
          'Provider',
          'Consumer',
          'Context',
          'FunctionComponent',
          'ForwardRefExoticComponent',
          'PropsWithoutRef',
          'PropsWithChildren',
          'ComponentProps',
          'MemoExoticComponent',
          'MutableRefObject',
          'MouseEvent',
        ].map((name) => [
          name,
          prepImportSubstitute(name, `${prefix}${name}`, 'tsflower/subst/react'),
        ]),
      ),

      // If adding to this: note that currently any namespace rewrites within a
      // given library are ignored!  That is, the `namespaces` property of one
      // of these NamespaceRewrite values is never consulted.  See use sites.
    },
    {
      JSX: mkNamespaceRewrite({
        Element: prepImportSubstitute(
          'JSX$Element',
          `${prefix}JSX$Element`,
          'tsflower/subst/react',
        ),
      }),
    },
  );
}

/**
 * Prepare our static rewrites for the global `JSX` namespace from `@types/react`.
 */
export function prepGlobalJsxRewrites(): NamespaceRewrite {
  return mkNamespaceRewrite({
    Element: prepImportSubstitute(
      'JSX$Element',
      `${prefix}JSX$Element`,
      'tsflower/subst/react',
    ),

    // If adding to this: note the unimplemented cases in findGlobalRewrites,
    // where we use this map.
  });
}
