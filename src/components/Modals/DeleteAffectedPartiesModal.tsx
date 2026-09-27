import React from 'react';
import {
  AffectedRecordsModal,
  type AffectedRecordOption,
  type AffectedRecordsModalProps,
} from './AffectedRecordsModal';

export type AffectedPartyOption = AffectedRecordOption;
export type DeleteAffectedPartiesModalProps = AffectedRecordsModalProps;

export const DeleteAffectedPartiesModal: React.FC<DeleteAffectedPartiesModalProps> = (props) => {
  return <AffectedRecordsModal mode={props.mode || 'delete'} {...props} />;
};
