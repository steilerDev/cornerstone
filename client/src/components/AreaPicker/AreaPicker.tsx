import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { AreaResponse } from '@cornerstone/shared';
import { SearchPicker } from '../SearchPicker/SearchPicker.js';
import type { SearchPickerProps } from '../SearchPicker/SearchPicker.js';
import { buildTree, getAncestorPath, searchTree } from '../../lib/areaTreeUtils.js';
import type { TreeNode } from '../../lib/areaTreeUtils.js';

export interface AreaPickerProps extends Omit<
  SearchPickerProps<TreeNode>,
  'searchFn' | 'renderItem' | 'excludeIds'
> {
  areas: AreaResponse[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  nullable?: boolean;
}

export function AreaPicker({
  areas,
  value,
  onChange,
  disabled = false,
  nullable = false,
  ...rest
}: AreaPickerProps) {
  const { t } = useTranslation('common');
  const tree = buildTree(areas);

  const searchFn = useCallback(
    async (query: string): Promise<TreeNode[]> => {
      return searchTree(tree, query);
    },
    [tree],
  );

  const renderItem = (node: TreeNode) => {
    const indent = node.depth > 0 ? '\u2014 '.repeat(node.depth) : '';
    return { id: node.area.id, label: indent + node.area.name };
  };

  const renderSelectedLabel = (node: TreeNode) => {
    return node.area.name;
  };

  const renderSecondary = (node: TreeNode): string | null => {
    const path = getAncestorPath(areas, node.area.id);
    return path || null;
  };

  const selectedNode = tree.find((n) => n.area.id === value);
  const initialTitle = selectedNode ? selectedNode.area.name : undefined;

  return (
    <SearchPicker<TreeNode>
      value={value}
      onChange={onChange}
      excludeIds={[]}
      disabled={disabled}
      searchFn={searchFn}
      renderItem={renderItem}
      renderSelectedLabel={renderSelectedLabel}
      renderSecondary={renderSecondary}
      initialTitle={initialTitle}
      showItemsOnFocus={true}
      placeholder={t('aria.selectArea')}
      specialOptions={nullable ? [{ id: '', label: t('aria.noArea') }] : undefined}
      {...rest}
    />
  );
}

export default AreaPicker;
