import { useTranslation } from 'react-i18next';
import type { AreaResponse } from '@cornerstone/shared';
import { SearchPicker } from '../SearchPicker/SearchPicker.js';
import type { SearchPickerProps } from '../SearchPicker/SearchPicker.js';
import { buildTree } from '../../lib/areaTreeUtils.js';
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

  const searchFn = async (query: string): Promise<TreeNode[]> => {
    const lowerQuery = query.toLowerCase();
    if (!lowerQuery) return tree;
    return tree.filter(({ area }) => area.name.toLowerCase().includes(lowerQuery));
  };

  const renderItem = (node: TreeNode) => {
    const indent = node.depth > 0 ? '\u2014\u00a0'.repeat(node.depth) : '';
    return {
      id: node.area.id,
      label: indent + node.area.name,
    };
  };

  // Find the currently selected node to generate initialTitle with proper indentation
  const selectedNode = tree.find((n) => n.area.id === value);
  const initialTitle = selectedNode
    ? renderItem(selectedNode).label
    : undefined;

  return (
    <SearchPicker<TreeNode>
      value={value}
      onChange={onChange}
      excludeIds={[]}
      disabled={disabled}
      searchFn={searchFn}
      renderItem={renderItem}
      initialTitle={initialTitle}
      showItemsOnFocus={true}
      placeholder={t('aria.selectArea')}
      specialOptions={nullable ? [{ id: '', label: t('aria.noArea') }] : undefined}
      {...rest}
    />
  );
}

export default AreaPicker;
