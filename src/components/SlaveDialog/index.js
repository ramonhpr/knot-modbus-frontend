import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import TextField from '@material-ui/core/TextField';
import MenuItem from '@material-ui/core/MenuItem';
import Button from '@material-ui/core/Button';
import LinearProgress from '@material-ui/core/LinearProgress';

const parities = [{ id: 1, value: 'N' }, { id: 2, value: 'E' }, { id: 3, value: 'O' }];
const urlTypes = [{ id: 1, value: 'tcp://' }, { id: 2, value: 'serial:/' }];
const baudRates = [
  110, 300, 600, 1200, 2400, 4800, 9600, 14400, 19200, 38400,
  57600, 115200, 230400, 250000, 460800, 500000, 921600, 1000000
];

const SlaveDialog = ({
  open, error, onClose, onSave
}) => {
  const [urlType, setUrlType] = useState(urlTypes[0].value);
  const [ip, setIp] = useState();
  const [port, setPort] = useState();
  const [path, setPath] = useState('/dev/tty');
  const [speed, setSpeed] = useState(115200);
  const [parity, setParity] = useState('N');
  const [dataBit, setDataBit] = useState(8);
  const [stopBit, setStopBit] = useState(1);
  const [name, setName] = useState();
  const [slaveId, setSlaveId] = useState();
  const [renderProgress, setProgress] = useState(false);

  const cleanUp = () => {
    setUrlType(urlTypes[0].value);
    setName();
    setSlaveId();
    setIp();
    setPort();
    setProgress(false);
    onClose();
  };

  const buildUrl = () => {
    if (urlType === urlTypes[0].value) {
      return `${urlType}${ip}:${port}`;
    } if (urlType === urlTypes[1].value) {
      return `${urlType}${path}:${speed},'${parity}',${dataBit},${stopBit}`;
    }
    return '';
  };

  const checkUrl = () => {
    if (urlType === urlTypes[0].value) {
      return ip && port;
    } if (urlType === urlTypes[1].value) {
      return path && parity && speed && dataBit && stopBit;
    }
    return false;
  };

  const handleSaveButton = () => {
    if (name && slaveId && checkUrl()) {
      onSave({ name, id: slaveId, url: buildUrl() });
      cleanUp();
    }
  };

  const renderUrlFields = () => {
    if (urlType === urlTypes[0].value) {
      return [
        <TextField
          key={1}
          required
          placeholder="IP"
          margin="dense"
          onChange={(e) => { setIp(e.target.value); }}
          value={ip}
        />,
        <TextField
          key={2}
          required
          placeholder="Port"
          type="number"
          margin="dense"
          onChange={(e) => { setPort(e.target.value); }}
          inputProps={{ min: '0', max: '65535', step: '1' }}
          value={port}
        />
      ];
    } if (urlType === urlTypes[1].value) {
      return [
        <TextField
          key={3}
          required
          placeholder="path"
          margin="dense"
          onChange={(e) => { setPath(e.target.value); }}
          value={path}
        />,
        <TextField
          key={4}
          select
          required
          placeholder="speed"
          type="number"
          margin="dense"
          onChange={(e) => { setSpeed(e.target.value); }}
          inputProps={{ min: '110', max: '1000000', step: '100' }}
          value={speed}
          helperText="baud rate"
        >
          {baudRates.map(baudrate => (
            <MenuItem key={baudrate} value={baudrate}>{baudrate}</MenuItem>
          ))}
        </TextField>,
        <TextField
          key={5}
          select
          required
          placeholder="parity"
          margin="dense"
          onChange={(e) => { setParity(e.target.value); }}
          inputProps={{ min: '1', max: '2', step: '1' }}
          value={parity}
          helperText="parity"
        >
          {parities.map(p => (
            <MenuItem key={p.id} value={p.value}>{p.value}</MenuItem>
          ))}
        </TextField>,
        <TextField
          key={6}
          required
          placeholder="data_bit"
          type="number"
          margin="dense"
          onChange={(e) => { setDataBit(e.target.value); }}
          inputProps={{ min: '5', max: '8', step: '1' }}
          value={dataBit}
          helperText="data"
        />,
        <TextField
          key={7}
          required
          placeholder="stop_bit"
          type="number"
          margin="dense"
          onChange={(e) => { setStopBit(e.target.value); }}
          inputProps={{ min: '0', max: '1', step: '1' }}
          value={stopBit}
          helperText="stop"
        />
      ];
    }
    return null;
  };

  useEffect(() => {
    if (error) {
      setProgress(false);
    }
  }, [error]);

  return (
    <Dialog
      open={open}
      onClose={cleanUp}
    >
      <DialogTitle>Create a Slave</DialogTitle>
      <form onSubmit={(e) => { e.preventDefault(); setProgress(true); }}>
        <DialogContent>
          <TextField
            required
            label="name"
            autoFocus
            margin="dense"
            onChange={(e) => { setName(e.target.value); }}
            value={name}
            fullWidth
          />
          <TextField
            required
            label="id"
            margin="dense"
            onChange={(e) => { setSlaveId(e.target.value); }}
            value={slaveId}
            type="number"
            inputProps={{ min: '0', max: '247', step: '1' }}
            fullWidth
          />
          <TextField
            required
            select
            value={urlType}
            onChange={(e) => { setUrlType(e.target.value); }}
            margin="dense"
            helperText="URL type"
          >
            {urlTypes.map(option => (
              <MenuItem key={option.id} value={option.value}>
                {option.value}
              </MenuItem>
            ))}
          </TextField>
          {renderUrlFields()}
        </DialogContent>
        <DialogActions>
          <Button onClick={cleanUp} color="primary">
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={handleSaveButton}
            color="primary"
          >
            Save
          </Button>
        </DialogActions>
        { (renderProgress && !error) ? <LinearProgress /> : null}
      </form>
    </Dialog>
  );
};

SlaveDialog.propTypes = {
  open: PropTypes.string.isRequired,
  error: PropTypes.bool.isRequired,
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired
};

export default SlaveDialog;
