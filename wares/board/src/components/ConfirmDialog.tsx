import { __ }    from '@wordpress/i18n';
import { Modal } from '@bazaar/design';

interface Props {
  open:      boolean;
  message:   string;
  onConfirm: () => void;
  onCancel:  () => void;
}

export default function ConfirmDialog( { open, message, onConfirm, onCancel }: Props ) {
  return (
    <Modal
      open={ open }
      onClose={ onCancel }
      title={ __( 'Confirm', 'bazaar' ) }
      size="sm"
      footer={
        <div className="board-confirm__actions">
          <button className="board-confirm__btn board-confirm__btn--danger" onClick={ onConfirm }>
            { __( 'Confirm', 'bazaar' ) }
          </button>
          <button className="board-confirm__btn" onClick={ onCancel }>
            { __( 'Cancel', 'bazaar' ) }
          </button>
        </div>
      }
    >
      <p className="board-confirm__msg">{ message }</p>
    </Modal>
  );
}
