import React, { Component } from 'react';
import './App.css';
import Grid from '@material-ui/core/Grid';
import AppBar from '@material-ui/core/AppBar';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import Snackbar from '@material-ui/core/Snackbar';
import Fab from '@material-ui/core/Fab';
import AddIcon from '@material-ui/icons/Add';
import SlaveService from './services/Slave';
import SlaveCard from './components/SlaveCard';
import SlaveDialog from './components/SlaveDialog';

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      renderCard: false,
      slaves: [],
      slaveSrv: new SlaveService(),
      openSnack: false,
      openDialog: false,
      messageSnack: ''
    };
  }

  componentDidMount() {
    const { slaveSrv } = this.state;
    this.timer = slaveSrv.once('open', () => {
      this.listSlaves();
    });
    // TODO: if not opened show a message to the user,
    // like to refresh page or a spinner with a timeout to try again
  }

  listSlaves() {
    const { slaveSrv } = this.state;
    slaveSrv.listSlaves()
      .then((slaves) => {
        slaves.forEach((slave) => { slave.expanded = false; });
        this.setState({ renderCard: true, slaves });
        this.monitorSlaves();
      })
      .catch((err) => {
        this.setState({ openSnack: true, messageSnack: err.message });
      });
  }

  monitorSlaves() {
    const { slaveSrv, slaves } = this.state;

    slaveSrv.on('slaveRemoved', (id) => {
      slaves.splice(slaves.findIndex(slave => slave.id === id), 1);
      this.setState({ slaves });
    });

    slaveSrv.on('slaveAdded', (slave) => {
      if (!slaves.some(slv => slv.id === slave.id)) {
        slave.expanded = false;
        slaves.push(slave);
        this.setState({ slaves });
      }
    });

    slaveSrv.on('slaveUpdated', ({ id, properties }) => {
      const slave = slaves.find(slv => slv.id === Number(id));
      if (slave) {
        Object.assign(slave, properties);
        this.setState({ slaves });
      }
    });

    slaveSrv.on('sourceUpdated', ({ id, addr, properties }) => {
      const slave = slaves.find(slv => slv.id === Number(id));
      if (slave && slave.sources) {
        const source = slave.sources.find(src => src.address === addr);
        Object.assign(source, properties);
        this.setState({ slaves });
      }
    });
  }

  async handleSaveDialog(slave) {
    const { slaveSrv } = this.state;
    try {
      await slaveSrv.addSlave(slave);
      this.setState({ openDialog: false });
    } catch (error) {
      this.setState({ openSnack: true, messageSnack: error.message });
    }
  }

  async renderSources(slaveId) {
    const { slaves, slaveSrv } = this.state;
    const slave = slaves.find(slv => slv.id === slaveId);
    try {
      const sources = await slaveSrv.listSources(slave.id);
      slave.sources = sources;
      slave.expanded = !slave.expanded;
      this.setState({ slaves });
    } catch (err) {
      this.setState({ openSnack: true, messageSnack: err.message });
    }
  }

  renderCardSlaves() {
    const { slaves } = this.state;
    return (
      <Grid container>
        { slaves.map(slave => (
          <SlaveCard key={slave.id} slave={slave} onExpanded={() => this.renderSources(slave.id)} />
        ))
        }
      </Grid>
    );
  }

  render() {
    const {
      renderCard, slaveSrv, openSnack, openDialog, messageSnack
    } = this.state;
    return (
      <div className="App">
        <AppBar position="static">
          <Toolbar>
            <Typography variant="h6" color="inherit">
              KNoT Modbus
            </Typography>
          </Toolbar>
        </AppBar>
        <Snackbar
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'left'
          }}
          open={openSnack}
          autoHideDuration={3000}
          onClose={() => this.setState({ openSnack: false })}
          message={messageSnack}
        />

        { renderCard === true ? this.renderCardSlaves() : null }
        { slaveSrv.isOpen && (
        <Fab onClick={() => this.setState({ openDialog: true })} color="secondary" style={{ position: 'absolute', bottom: '20px', right: '20px' }}>
          <AddIcon />
        </Fab>
        ) }
        <SlaveDialog
          open={openDialog}
          error={openSnack}
          onClose={() => this.setState({ openDialog: false })}
          onSave={slave => this.handleSaveDialog(slave)}
        />
      </div>
    );
  }
}

export default App;
